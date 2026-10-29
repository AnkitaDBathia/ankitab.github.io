export const moods = ['Great','Good','Okay','Low','Stressed','Calm','Energised','Tired'];
export function supportsMood(activity) {
  return ['yoga', 'meditation'].includes(activity.seed_key) || /yoga|meditation/i.test(activity.name ?? '');
}
export function favouritesFirst(items) {
  return [...items].sort((a,b) => Number(!!b.favourite) - Number(!!a.favourite));
}
export function searchLogs(logs, data, query) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return logs.filter(log => {
    const activity = data.activities.find(a => a.id === log.activity_id);
    const item = data.items.find(i => i.id === log.item_id);
    const text = [activity?.name,item?.name,item?.author,log.mood,log.mood_note,
      ...Object.values(log.values ?? {})].join(' ').toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}

// Recognition starts only on an explicit click. Only the resulting text is saved.
export function attachDictation(form, scope = globalThis) {
  const button = form.querySelector('[data-dictate]');
  if (!button) return;
  const status = form.querySelector('[data-voice-status]');
  const note = form.elements.namedItem('mood_note');
  const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  if (!Recognition) {
    button.hidden = true;
    status.textContent = 'Voice input is unavailable in this browser. You can type your note.';
    return;
  }
  let recognition = null;
  function stop() {
    const current = recognition;
    recognition = null;
    current?.abort();
    button.textContent = 'Voice note';
  }
  button.onclick = () => {
    if (recognition) { stop(); status.textContent = 'Stopped. Review your note before saving.'; return; }
    const current = new Recognition();
    recognition = current;
    current.lang = form.elements.namedItem('voice_language').value;
    current.interimResults = false;
    current.continuous = true;
    current.onresult = event => {
      if (recognition !== current || !form.isConnected) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) note.value = `${note.value}${note.value ? ' ' : ''}${event.results[i][0].transcript}`.slice(0, 10000);
      }
    };
    current.onerror = event => {
      if (recognition !== current) return;
      stop();
      status.textContent = event.error === 'not-allowed'
        ? 'Microphone permission was denied. You can type instead.'
        : 'Voice input stopped. Please retry or type your note.';
    };
    current.onend = () => {
      if (recognition !== current) return;
      recognition = null;
      button.textContent = 'Voice note';
      status.textContent = 'Review your note before saving.';
    };
    try {
      current.start();
      button.textContent = 'Stop listening';
      status.textContent = 'Listening...';
    } catch { stop(); status.textContent = 'Could not start voice input. Please type instead.'; }
  };
  form.addEventListener('submit', stop, true);
  const observer = new scope.MutationObserver(() => {
    if (!form.isConnected) { stop(); observer.disconnect(); }
  });
  observer.observe(form.ownerDocument.body, {childList:true,subtree:true});
}
