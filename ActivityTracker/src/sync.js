// Coalesce focus/visibility events and defer while the user is editing.
export function createResumeSync({ canRun, run, onError, delay = 750 }) {
  let wanted = false, running = false, timer;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }
  async function flush() {
    if (!wanted || running) return;
    if (!canRun()) { schedule(); return; }
    wanted = false;
    running = true;
    try {
      if (await run() === false) wanted = true;
    } catch (error) {
      onError(error);
    } finally {
      running = false;
      if (wanted) schedule();
    }
  }
  return {
    request() { wanted = true; schedule(); },
    cancel() { wanted = false; clearTimeout(timer); },
  };
}
