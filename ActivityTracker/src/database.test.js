import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  describe,
  it,
  before as beforeAll,
  after as afterAll,
} from "node:test";
import { expect } from "../tests/assertions.js";
import assert from "node:assert/strict";
let db;
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
let water, reading, bobWater;
async function asUser(id) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
beforeAll(
  async () => {
    db = new PGlite();
    await db.exec(
      `create role service_role;create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${alice}'),('${bob}');`,
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202610210001_initial.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/202610290001_targets.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(readFileSync(new URL("../supabase/migrations/202610290002_favourites_mood.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../supabase/migrations/202610300001_usernames.sql", import.meta.url), "utf8"));
    await asUser(alice);
    await db.exec("select initialize_journey(); insert into activity_logs(id,user_id,activity_id,values,occurred_at) select '33333333-3333-4333-8333-333333333333',user_id,id,'{\"quantity\":7}','2025-01-01T10:00:00Z' from activities where seed_key='water'; reset role;");
    await db.exec(readFileSync(new URL("../supabase/migrations/202611020001_unified_habits.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../supabase/migrations/202611020002_account_admins.sql", import.meta.url), "utf8"));
    await asUser(alice);
    await db.exec("select public.initialize_journey();");
    water = (await db.query("select id from activities where seed_key='water'"))
      .rows[0].id;
    reading = (
      await db.query("select id from activities where seed_key='reading'")
    ).rows[0].id;
    await asUser(bob);
    await db.exec("select public.initialize_journey();");
    bobWater = (
      await db.query("select id from activities where seed_key='water'")
    ).rows[0].id;
  },
  { timeout: 30000 },
);
afterAll(async () => {
  await db?.close();
});
describe("Real PostgreSQL migration, validation and RLS", () => {
  it('allows only SQL administrators to grant account-creation access', async()=>{
    await db.exec('reset role');
    await db.query('insert into account_admins(user_id) values($1)',[alice]);
    await asUser(bob);
    assert.equal((await db.query('select * from account_admins')).rows.length,0);
    await assert.rejects(db.query('insert into account_admins(user_id) values($1)',[bob]));
    await assert.rejects(db.query('update account_admins set user_id=$1',[bob]));
    await asUser(alice);
    assert.equal((await db.query('select * from account_admins')).rows[0].user_id,alice);
    await assert.rejects(db.query('insert into account_admins(user_id) values($1)',[bob]));
    await db.exec('reset role;set role anon');
    await assert.rejects(db.query('select * from account_admins'));
  });
  it("keeps usernames private and limits server-side login attempts", async () => {
    await db.exec("reset role;");
    await db.query("insert into login_usernames(username,user_id) values('alice', $1)", [alice]);
    await asUser(bob);
    await expect(db.query("select * from login_usernames")).rejects.toThrow();
    await expect(db.query("select allow_username_login('test')")).rejects.toThrow();
    await db.exec("reset role; set role service_role;");
    for (let i=0;i<10;i++) expect((await db.query("select allow_username_login('test') as allowed")).rows[0].allowed).toBe(true);
    expect((await db.query("select allow_username_login('test') as allowed")).rows[0].allowed).toBe(false);
    await db.exec("reset role;");
    await db.query("update username_login_attempts set started_at=now()-interval '16 minutes' where key='test'");
    expect((await db.query("select allow_username_login('test') as allowed")).rows[0].allowed).toBe(true);
  });
  it("persists favourites and mood notes with ownership and mood validation", async () => {
    await asUser(alice);
    const item = (await db.query("insert into activity_items(user_id,activity_id,name,favourite) values($1,$2,'Pinned',true) returning id,favourite", [alice,reading])).rows[0];
    expect(item.favourite).toBe(true);
    const log = (await db.query("insert into activity_logs(user_id,activity_id,values,mood,mood_note) values($1,$2,'{\"quantity\":1}','Calm','Peaceful') returning id,mood_note", [alice,water])).rows[0];
    expect(log.mood_note).toBe("Peaceful");
    await expect(db.query("update activity_logs set mood='invalid' where id=$1", [log.id])).rejects.toThrow();
    await asUser(bob);
    expect((await db.query("select id from activity_logs where id=$1", [log.id])).rows).toHaveLength(0);
    expect((await db.query("update activity_items set favourite=false where id=$1 returning id", [item.id])).rows).toHaveLength(0);
    await asUser(alice);
    await db.query("delete from activity_logs where id=$1", [log.id]);
    await db.query("delete from activity_items where id=$1", [item.id]);
  });
  it("stores positive daily targets and preserves overall item goals by default", async () => {
    await asUser(alice);
    await db.query("update activities set daily_goal=8 where id=$1", [water]);
    expect(
      (await db.query("select daily_goal from activities where id=$1", [water]))
        .rows[0].daily_goal,
    ).toBe("8");
    await expect(
      db.query("update activities set daily_goal=-1 where id=$1", [water]),
    ).rejects.toThrow();
    const item = await db.query(
      "insert into activity_items(user_id,activity_id,name,goal) values($1,$2,'Target test',100) returning id,goal_period",
      [alice, reading],
    );
    expect(item.rows[0].goal_period).toBe("total");
    await db.query(
      "update activity_items set goal_period='daily' where id=$1",
      [item.rows[0].id],
    );
    await expect(
      db.query("update activity_items set goal_period='weekly' where id=$1", [
        item.rows[0].id,
      ]),
    ).rejects.toThrow();
    await db.query("delete from activity_items where id=$1", [item.rows[0].id]);
  });
  it("seeds exactly five private activities idempotently", async () => {
    await asUser(alice);
    await db.exec("select public.initialize_journey();");
    expect((await db.query("select * from activities")).rows).toHaveLength(5);
    expect((await db.query("select * from user_settings")).rows).toHaveLength(
      1,
    );
  });
  it("blocks cross-user reads, writes and forged ownership", async () => {
    await asUser(alice);
    expect(
      (await db.query("select * from activities where id=$1", [bobWater])).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "insert into activity_logs(user_id,activity_id,values) values($1,$2,$3)",
        [bob, bobWater, { quantity: 1 }],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into activity_logs(user_id,activity_id,values) values($1,$2,$3)",
        [alice, bobWater, { quantity: 1 }],
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "update activities set name=$1 where id=$2 returning *",
          ["Hacked", bobWater],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("validates quantities on the server and preserves original schema on edits", async () => {
    await asUser(alice);
    await expect(
      db.query(
        "insert into activity_logs(user_id,activity_id,values) values($1,$2,$3)",
        [alice, water, { quantity: -1 }],
      ),
    ).rejects.toThrow();
    const inserted = await db.query(
      "insert into activity_logs(user_id,activity_id,values) values($1,$2,$3) returning *",
      [alice, water, { quantity: 2 }],
    );
    const id = inserted.rows[0].id;
    expect(inserted.rows[0].field_snapshot).toHaveLength(1);
    await db.query(
      "update activities set fields='[]',quantity_field_id=null where id=$1",
      [water],
    );
    await db.query(
      "update activity_logs set values=$1,field_snapshot=$2 where id=$3",
      [{ quantity: 5 }, [], id],
    );
    const updated = (
      await db.query("select * from activity_logs where id=$1", [id])
    ).rows[0];
    expect(updated.values.quantity).toBe(5);
    expect(updated.field_snapshot).toHaveLength(1);
    await db.query("delete from activity_logs where id=$1", [id]);
    expect(
      (await db.query("select * from activity_logs where id=$1", [id])).rows,
    ).toHaveLength(0);
  });
  it("requires matching owned items and protects private item and log rows", async () => {
    await asUser(alice);
    const item = (
      await db.query(
        "insert into activity_items(user_id,activity_id,name) values($1,$2,$3) returning id",
        [alice, reading, "A book"],
      )
    ).rows[0].id;
    await expect(
      db.query(
        "insert into activity_logs(user_id,activity_id,values) values($1,$2,$3)",
        [alice, reading, { quantity: 5 }],
      ),
    ).rejects.toThrow();
    const log = (
      await db.query(
        "insert into activity_logs(user_id,activity_id,item_id,values) values($1,$2,$3,$4) returning id",
        [alice, reading, item, { quantity: 5 }],
      )
    ).rows[0].id;
    await asUser(bob);
    expect(
      (await db.query("select * from activity_items where id=$1", [item])).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from activity_logs where id=$1", [log])).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("delete from activity_logs where id=$1 returning *", [
          log,
        ])
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "insert into activity_logs(user_id,activity_id,item_id,values) values($1,$2,$3,$4)",
        [bob, bobWater, item, { quantity: 1 }],
      ),
    ).rejects.toThrow();
  });
  it("creates and validates custom activities and rejects invalid configuration", async () => {
    await asUser(alice);
    const fields = [
      {
        id: "steps",
        label: "Steps",
        type: "number",
        required: true,
        default_value: 1,
        position: 0,
        options: [],
        min: 1,
        max: 100000,
      },
    ];
    const a = await db.query(
      "insert into activities(user_id,name,fields,quantity_field_id) values($1,$2,$3,$4) returning id",
      [alice, "Walking", fields, "steps"],
    );
    await db.query(
      "insert into activity_logs(user_id,activity_id,values) values($1,$2,$3)",
      [alice, a.rows[0].id, { steps: 500 }],
    );
    await expect(
      db.query("insert into activities(user_id,name,fields) values($1,$2,$3)", [
        alice,
        "Invalid",
        [{ ...fields[0], default_value: -1 }],
      ]),
    ).rejects.toThrow();
    await expect(
      db.query(
        "update user_settings set timezone='Not/AZone' where user_id=$1",
        [alice],
      ),
    ).rejects.toThrow();
  });
  it("denies anonymous table access", async () => {
    await db.exec("reset role;set role anon;");
    await expect(db.query("select * from activity_logs")).rejects.toThrow();
    await expect(
      db.query("select public.initialize_journey()"),
    ).rejects.toThrow();
  });
  it('preserves legacy data and starts dated settings only at migration time',async()=>{
    await asUser(alice);
    const old=(await db.query("select * from activity_logs where id='33333333-3333-4333-8333-333333333333'")).rows[0];
    assert.equal(old.values.quantity,7);assert.equal(old.habit_type,'build');assert.equal(old.habit_snapshot,null);assert.equal(old.habit_day,null);
    assert.equal((await db.query("select count(*)::int as n from habit_revisions where effective_day<'2025-01-02'")).rows[0].n,0);
  });
  it('enforces one boundary per local day and freezes its settings during corrections',async()=>{
    await asUser(alice);
    const a=(await db.query("insert into activities(user_id,name,habit_type,boundary) values($1,'Bedtime','maintain','Phone away') returning id",[alice])).rows[0];
    const entry=(await db.query("insert into activity_logs(user_id,activity_id,values,outcome) values($1,$2,'{}','achieved') returning *",[alice,a.id])).rows[0];
    assert.equal(entry.habit_timezone,'Asia/Kolkata');assert.equal(entry.habit_snapshot.boundary,'Phone away');
    await assert.rejects(db.query("insert into activity_logs(user_id,activity_id,values,outcome,occurred_at) values($1,$2,'{}','not_achieved',$3)",[alice,a.id,entry.occurred_at]));
    await db.query("update activities set boundary='New rule',applicable_days=array[1,2,3] where id=$1",[a.id]);
    const corrected=(await db.query("update activity_logs set outcome='not_achieved',habit_timezone='UTC',habit_snapshot='{}' where id=$1 returning *",[entry.id])).rows[0];
    assert.equal(corrected.habit_snapshot.boundary,'Phone away');assert.equal(corrected.habit_timezone,'Asia/Kolkata');assert.equal(corrected.outcome,'not_achieved');
    await assert.rejects(db.query("update activities set habit_type='build' where id=$1",[a.id]));
    await assert.rejects(db.query("update activity_logs set outcome='replaced' where id=$1",[entry.id]));
    // UTC dates differ, but these instants are the same Kolkata day.
    await db.query("insert into activity_logs(user_id,activity_id,values,outcome,occurred_at) values($1,$2,'{}','achieved','2025-03-03T19:00:00Z')",[alice,a.id]);
    await assert.rejects(db.query("insert into activity_logs(user_id,activity_id,values,outcome,occurred_at) values($1,$2,'{}','achieved','2025-03-04T01:00:00Z')",[alice,a.id]));
    await db.query("insert into activity_logs(user_id,activity_id,values,outcome,occurred_at) values($1,$2,'{}','not_applicable','2025-03-04T19:00:00Z')",[alice,a.id]);
  });
  it('accepts multiple real replacement opportunities and validates optional measurements',async()=>{
    await asUser(alice);
    const fields=[{id:'minutes',label:'Minutes',type:'duration',required:false,default_value:null,position:0,options:[],min:0,max:null}];
    const a=(await db.query("insert into activities(user_id,name,habit_type,unwanted_behavior,replacement,fields,quantity_field_id,unit) values($1,'Breathe','replace','Checking phone','Breathe',$2,'minutes','minutes') returning id",[alice,fields])).rows[0];
    for(const outcome of ['replaced','not_replaced','not_applicable']) await db.query("insert into activity_logs(user_id,activity_id,values,outcome) values($1,$2,'{}',$3)",[alice,a.id,outcome]);
    await assert.rejects(db.query("insert into activity_logs(user_id,activity_id,values,outcome) values($1,$2,'{\"minutes\":-1}','replaced')",[alice,a.id]));
    const entry=(await db.query("insert into activity_logs(user_id,activity_id,values,outcome) values($1,$2,'{\"minutes\":15}','replaced') returning *",[alice,a.id])).rows[0];
    await db.query("update activities set unit='seconds' where id=$1",[a.id]);
    const edited=(await db.query("update activity_logs set values='{\"minutes\":20}',measurement_unit='seconds' where id=$1 returning *",[entry.id])).rows[0];
    assert.equal(edited.measurement_unit,'minutes');assert.equal(edited.values.minutes,20);
    await assert.rejects(db.query("update activities set daily_goal=5 where id=$1",[a.id]));
  });
  it('isolates reflections and revisions and disallows client-written history',async()=>{
    await asUser(alice);
    const r=(await db.query("insert into weekly_reflections(user_id,week_start,went_well) values($1,'2026-10-26','Small steps') returning id",[alice])).rows[0];
    await assert.rejects(db.query("insert into weekly_reflections(user_id,week_start) values($1,'2026-10-26')",[alice]));
    await assert.rejects(db.query("insert into weekly_reflections(user_id,week_start) values($1,'2026-10-27')",[alice]));
    await assert.rejects(db.query("update habit_revisions set snapshot='{}' where activity_id=$1",[water]));
    await assert.rejects(db.query("insert into habit_revisions(user_id,activity_id,effective_day,snapshot) values($1,$2,current_date,'{}')",[alice,water]));
    await asUser(bob);
    assert.equal((await db.query("select * from habit_revisions where activity_id=$1",[water])).rows.length,0);
    assert.equal((await db.query("select * from weekly_reflections where id=$1",[r.id])).rows.length,0);
    assert.equal((await db.query("update weekly_reflections set went_well='hacked' where id=$1 returning id",[r.id])).rows.length,0);
    await assert.rejects(db.query("insert into weekly_reflections(user_id,week_start) values($1,'2026-11-02')",[alice]));
    await asUser(alice);
    await db.query("update weekly_reflections set next_step='Read a page' where id=$1",[r.id]);
    await db.query("delete from weekly_reflections where id=$1",[r.id]);
  });
  it('retains actual Build amounts and the first recorded daily goal after configuration changes',async()=>{
    await asUser(alice);
    const fields=[{id:'pages',label:'Pages',type:'number',required:true,default_value:1,position:0,options:[],min:0,max:null}];
    const a=(await db.query("insert into activities(user_id,name,fields,quantity_field_id,unit,daily_goal) values($1,'Read more',$2,'pages','pages',10) returning id",[alice,fields])).rows[0];
    const first=(await db.query("insert into activity_logs(user_id,activity_id,values) values($1,$2,'{\"pages\":30}') returning *",[alice,a.id])).rows[0];
    await db.query("update activities set daily_goal=50 where id=$1",[a.id]);
    const next=(await db.query("insert into activity_logs(user_id,activity_id,values) values($1,$2,'{\"pages\":5}') returning *",[alice,a.id])).rows[0];
    assert.equal(first.values.pages,30);assert.equal(next.habit_snapshot.daily_goal,10);
    const revision=(await db.query("select snapshot from habit_revisions where activity_id=$1 order by effective_day desc limit 1",[a.id])).rows[0];
    assert.equal(revision.snapshot.daily_goal,50);
    const backdated=(await db.query("insert into activity_logs(user_id,activity_id,values,occurred_at) values($1,$2,'{\"pages\":3}','2020-01-01T12:00:00Z') returning *",[alice,a.id])).rows[0];
    assert.equal(backdated.habit_snapshot,null);assert.equal(backdated.values.pages,3);
  });
});
