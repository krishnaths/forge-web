import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import * as ai from '../ai.js';
import { Targets } from '../program.js';
import { STEPS_HEALTH_CONNECT, STEPS_MANUAL } from '../repo.js';
import { settings } from '../settings.js';
import { formatLitres, html, Icon, nf, toast } from './core.js';

// ---------------------------------------------------------------- page structure

export const PageHeader = ({ title, sub, actions }) => html`
  <header class="page-header">
    <div class="page-title">
      <h1>${title}</h1>
      ${sub && html`<p class="muted">${sub}</p>`}
    </div>
    ${actions && html`<div class="page-actions">${actions}</div>`}
  </header>`;

/** A titled panel. Panels are the page's sections; they carry a hairline, not a shadow. */
export const Panel = ({ title, actions, children, cls = '', id }) => html`
  <section class=${`panel ${cls}`} id=${id} aria-label=${typeof title === 'string' ? title : undefined}>
    ${(title || actions) && html`
      <div class="panel-head">
        ${title && html`<h2>${title}</h2>`}
        ${actions && html`<div class="panel-actions">${actions}</div>`}
      </div>`}
    ${children}
  </section>`;

/** A figure set in the condensed face: the plate-stamp numerals the app is built around. */
export const Figure = ({ value, unit, tone = '' }) => html`
  <span class=${`figure ${tone}`}>${value}${unit && html`<small>${unit}</small>`}</span>`;

export const Stat = ({ label, value, unit, sub, tone }) => html`
  <div class="stat">
    <div class="stat-label">${label}</div>
    <${Figure} value=${value} unit=${unit} tone=${tone} />
    ${sub && html`<div class="muted small">${sub}</div>`}
  </div>`;

// ---------------------------------------------------------------- controls

/** The one affordance that opens the AI dialog. Explicit, never a hidden gesture. */
export const AskAiButton = ({ onClick, label = 'Ask AI' }) => html`
  <button class="ask-ai" type="button" onClick=${onClick}>
    <${Icon} name="sparkle" size=${15} cls="accent" /> ${label}
  </button>`;

export const Chip = ({ selected, onClick, children, title }) => html`
  <button type="button" class=${`chip ${selected ? 'selected' : ''}`} aria-pressed=${selected}
          onClick=${onClick} title=${title}>
    ${children}
  </button>`;

export function ProgressBar({ fraction, met, thin }) {
  const pct = Math.max(0, Math.min(1, fraction || 0)) * 100;
  return html`<div class=${`bar ${thin ? 'thin' : ''}`} role="progressbar" aria-valuenow=${Math.round(pct)}
    aria-valuemin="0" aria-valuemax="100"><div class=${`bar-fill ${met ? 'met' : ''}`} style=${{ width: `${pct}%` }} /></div>`;
}

/** A tick row. Same look everywhere a thing is either done today or not. */
export const CheckRow = ({ label, checked, onToggle, sub, highlight }) => html`
  <button type="button" class=${`check-row ${checked ? 'checked' : ''} ${highlight ? 'highlight' : ''}`}
          role="checkbox" aria-checked=${checked} onClick=${() => onToggle(!checked)}>
    <span class="tick">${checked && html`<${Icon} name="check" size=${16} />`}</span>
    <span class="check-text">
      <span class="check-label">${label}</span>
      ${sub && html`<span class="muted small">${sub}</span>`}
    </span>
  </button>`;

/** − [ typed number ] +, for weight and reps. Typing is faster than tapping at a desk. */
export function NumberStepper({ label, value, onChange, step = 1, min = 0, suffix, decimals = 0 }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = raw => {
    const n = parseFloat(String(raw).replace(',', '.'));
    if (!Number.isNaN(n)) onChange(Math.max(min, decimals ? Math.round(n * 10) / 10 : Math.round(n)));
    else setText(String(value));
  };
  return html`
    <div class="stepper">
      <span class="stepper-label">${label}</span>
      <button type="button" class="step-button" aria-label=${`Decrease ${label}`}
              onClick=${() => onChange(Math.max(min, value - step))}><${Icon} name="remove" /></button>
      <span class="stepper-value">
        <input inputmode="decimal" aria-label=${label} value=${text}
               onInput=${e => setText(e.currentTarget.value)} onBlur=${e => commit(e.currentTarget.value)}
               onKeyDown=${e => { if (e.key === 'Enter') commit(e.currentTarget.value); }} />
        ${suffix && html`<small>${suffix}</small>`}
      </span>
      <button type="button" class="step-button" aria-label=${`Increase ${label}`}
              onClick=${() => onChange(value + step)}><${Icon} name="add" /></button>
    </div>`;
}

export const DayTypeSwitch = ({ plan, current, onChange }) => html`
  <div class="segmented" role="radiogroup" aria-label="Meal plan">
    ${plan.dayTypes.map(t => html`
      <button type="button" role="radio" aria-checked=${t.key === current}
              class=${t.key === current ? 'selected' : ''} onClick=${() => onChange(t.key)}>${t.label}</button>`)}
  </div>`;

// ---------------------------------------------------------------- modal

export function Modal({ onClose, title, children, actions, size = '' }) {
  const panel = useRef(null);
  // Layout effect: Escape must work the instant the dialog is on screen, not a frame later.
  useLayoutEffect(() => {
    const prev = document.activeElement;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    panel.current?.focus();
    document.body.classList.add('locked');
    return () => {
      removeEventListener('keydown', onKey);
      document.body.classList.remove('locked');
      prev?.focus?.();
    };
  }, []);
  return html`
    <div class="scrim" onMouseDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
      <div class=${`modal ${size}`} role="dialog" aria-modal="true" aria-label=${title} tabIndex="-1" ref=${panel}>
        <div class="modal-head">
          <h2>${title}</h2>
          <button type="button" class="icon-button" aria-label="Close" onClick=${onClose}><${Icon} name="close" /></button>
        </div>
        <div class="modal-body">${children}</div>
        ${actions && html`<div class="modal-actions">${actions}</div>`}
      </div>
    </div>`;
}

// ---------------------------------------------------------------- YouTube

/** Lists only ever show a thumbnail; a live player is built after a click. */
export const VideoThumb = ({ id, onClick, cls = '' }) => html`
  <button type="button" class=${`thumb ${cls}`} onClick=${onClick} aria-label="Play video">
    <img src=${`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" />
    <span class="play"><${Icon} name="play" size=${20} /></span>
  </button>`;

export const YouTubeEmbed = ({ id, autoplay }) => html`
  <div class="video">
    <iframe src=${`https://www.youtube-nocookie.com/embed/${id}?autoplay=${autoplay ? 1 : 0}&playsinline=1&rel=0`}
            title="YouTube video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowfullscreen referrerpolicy="strict-origin-when-cross-origin" />
  </div>`;

/** Thumbnail in place until clicked, then the player in the same spot. */
export function InlineVideo({ id }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => setPlaying(false), [id]);
  return playing ? html`<${YouTubeEmbed} id=${id} autoplay />`
    : html`<${VideoThumb} id=${id} cls="wide-thumb" onClick=${() => setPlaying(true)} />`;
}

export const youtubeUrl = id => `https://www.youtube.com/watch?v=${id}`;

export const VideoModal = ({ title, id, onClose }) => html`
  <${Modal} onClose=${onClose} title=${title} size="wide" actions=${html`
    <a class="text-button" href=${youtubeUrl(id)} target="_blank" rel="noopener">Open in YouTube</a>`}>
    <${YouTubeEmbed} id=${id} autoplay />
  <//>`;

// ---------------------------------------------------------------- Ask AI

function promptFor(ctx, q) {
  switch (ctx.kind) {
    case 'exercise': return ai.exercisePrompt(ctx.name, ctx.reps, ctx.targetWeightKg, ctx.focus, q);
    case 'meal': return ai.mealPrompt(ctx.slot, ctx.option, q);
    case 'stat': return ai.statPrompt(ctx.body, q);
    default: return ai.freeform(ctx.body, q);
  }
}

const SUGGESTIONS = {
  exercise: ai.EXERCISE_QUESTIONS, meal: ai.MEAL_QUESTIONS, stat: ai.PROGRESS_QUESTIONS, text: ai.MEAL_QUESTIONS,
};

export function AskAiModal({ ctx, onClose }) {
  const [target, setTarget] = useState(settings().preferredAi);
  const [question, setQuestion] = useState('');
  const send = q => {
    ai.ask(target, promptFor(ctx, q)).then(toast);
    onClose();
  };
  return html`
    <${Modal} onClose=${onClose} title=${`Ask about ${ctx.title}`}>
      <div class="row gap-8 wrap">
        <span class="muted">Send to</span>
        <${Chip} selected=${target === 'GEMINI'} onClick=${() => setTarget('GEMINI')}>Gemini<//>
        <${Chip} selected=${target === 'CHATGPT'} onClick=${() => setTarget('CHATGPT')}>ChatGPT<//>
        <${Chip} selected=${target === 'ASK'} onClick=${() => setTarget('ASK')}>Choose app<//>
      </div>
      <div class="suggestions">
        ${SUGGESTIONS[ctx.kind].map(q => html`
          <button type="button" class="suggestion" onClick=${() => send(q)}>${q}</button>`)}
      </div>
      <form class="ask-own" onSubmit=${e => { e.preventDefault(); if (question.trim()) send(question); }}>
        <label class="field grow">
          <span>Or ask your own</span>
          <textarea rows="2" value=${question} onInput=${e => setQuestion(e.currentTarget.value)}
                    onKeyDown=${e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && question.trim()) send(question); }} />
        </label>
        <button class="filled-button" type="submit" disabled=${!question.trim()}>Ask</button>
      </form>
      <p class="muted small">Your question is copied to the clipboard too, so you can paste it if the AI app opens empty.</p>
    <//>`;
}

/**
 * Select any part of a line and an "Ask AI" button appears beside it: the web version of the
 * phone's text-selection toolbar item. `onAsk` receives the selected text.
 */
export function SelectableAskText({ text, onAsk }) {
  const ref = useRef(null);
  const [sel, setSel] = useState(null);
  useEffect(() => {
    const onChange = () => {
      const s = getSelection();
      const inside = s && !s.isCollapsed && ref.current?.contains(s.anchorNode);
      setSel(inside ? s.toString().trim() : null);
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);
  return html`
    <span class="selectable" ref=${ref}>${text}
      ${sel && html`<button type="button" class="ask-ai inline" onMouseDown=${e => e.preventDefault()}
                            onClick=${() => { onAsk(sel); getSelection().removeAllRanges(); }}>
        <${Icon} name="sparkle" size=${13} cls="accent" /> Ask AI</button>`}
    </span>`;
}

// ---------------------------------------------------------------- daily targets

export function WaterControl({ ml, onAdd, compact }) {
  const met = ml >= Targets.WATER_ML;
  return html`
    <div class="target">
      <div class="target-head">
        <span class="target-name">Water</span>
        ${met && html`<${Icon} name="check" size=${16} cls="good" label="Target hit" />`}
      </div>
      <${Figure} value=${formatLitres(ml)} unit=${` / ${formatLitres(Targets.WATER_ML)} L`} tone=${met ? 'good' : ''} />
      <${ProgressBar} fraction=${ml / Targets.WATER_ML} met=${met} />
      <div class=${`row gap-6 ${compact ? '' : 'pad-top-6'}`}>
        <button type="button" class="outlined-button small-button" disabled=${ml <= 0} onClick=${() => onAdd(-250)}
                aria-label="Remove 250 ml">−250</button>
        <button type="button" class="tonal-button small-button grow" onClick=${() => onAdd(250)}>+250 ml</button>
        <button type="button" class="tonal-button small-button grow" onClick=${() => onAdd(500)}>+500 ml</button>
      </div>
    </div>`;
}

export function StepsControl({ log, onSet, inHistory }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const steps = log.steps;
  const met = (steps ?? 0) >= Targets.STEPS;
  const source = log.stepsSource === STEPS_MANUAL ? 'Typed in'
    : log.stepsSource === STEPS_HEALTH_CONNECT ? 'From Health Connect on the phone'
      : inHistory ? 'Not recorded' : 'Type it in, or let the phone sync it';
  const save = () => {
    const n = parseInt(text, 10);
    if (!Number.isNaN(n)) { onSet(n); setEditing(false); }
  };
  return html`
    <div class="target">
      <div class="target-head">
        <span class="target-name">Steps</span>
        ${met && html`<${Icon} name="check" size=${16} cls="good" label="Target hit" />`}
      </div>
      <${Figure} value=${steps != null ? nf.format(steps) : '—'} unit=${` / ${nf.format(Targets.STEPS)}`} tone=${met ? 'good' : ''} />
      <${ProgressBar} fraction=${(steps ?? 0) / Targets.STEPS} met=${met} />
      ${editing
        ? html`
          <form class="row gap-6" onSubmit=${e => { e.preventDefault(); save(); }}>
            <input class="inline-input grow" inputmode="numeric" aria-label="Step count" autofocus value=${text}
                   placeholder="Step count"
                   onInput=${e => setText(e.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
                   onKeyDown=${e => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }} />
            <button type="submit" class="tonal-button small-button">Save</button>
            ${log.stepsSource === STEPS_MANUAL && html`
              <button type="button" class="text-button" onClick=${() => { onSet(null); setEditing(false); }}>Clear</button>`}
          </form>`
        : html`
          <div class="row">
            <span class="muted small grow">${source}</span>
            <button type="button" class="text-button" onClick=${() => { setText(steps?.toString() ?? ''); setEditing(true); }}>
              ${steps == null ? 'Add' : 'Edit'}
            </button>
          </div>`}
    </div>`;
}

export const MeditationControl = ({ done, onSet }) => html`
  <div class="target">
    <div class="target-head">
      <span class="target-name">Meditation</span>
      ${done && html`<${Icon} name="check" size=${16} cls="good" label="Target hit" />`}
    </div>
    <${Figure} value=${done ? Targets.MEDITATION_MIN : 0} unit=${` / ${Targets.MEDITATION_MIN} min`} tone=${done ? 'good' : ''} />
    <${ProgressBar} fraction=${done ? 1 : 0} met=${done} />
    <${CheckRow} label=${done ? 'Done today' : `Meditated ${Targets.MEDITATION_MIN} min`} checked=${done} onToggle=${onSet} />
  </div>`;

/**
 * "Did I eat this": tick plus option chips when the slot has more than one option. Picking a chip
 * on an unticked slot ticks it — choosing what you ate is saying you ate it.
 */
export function MealTickRow({ slot, day, onSet, next }) {
  const followed = day.followed(slot.key);
  const option = day.optionIndex(slot.key);
  const title = slot.options[option]?.title;
  return html`
    <div class=${`meal-row ${next ? 'next' : ''}`}>
      <${CheckRow} label=${slot.title} checked=${followed} onToggle=${v => onSet(option, v)}
                   sub=${slot.options.length === 1 || followed ? title : null} />
      ${next && !followed && html`<span class="next-tag">Next up</span>`}
      ${slot.options.length > 1 && html`
        <div class="chips">
          ${slot.options.map((o, i) => html`
            <${Chip} selected=${followed && option === i} onClick=${() => onSet(i, true)}>${o.title}<//>`)}
        </div>`}
    </div>`;
}
