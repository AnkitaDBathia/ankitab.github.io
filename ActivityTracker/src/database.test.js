import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  describe,
  it,
  before as beforeAll,
  after as afterAll,
} from "node:test";
import { expect } from "../tests/assertions.js";
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
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${alice}'),('${bob}');`,
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
});
