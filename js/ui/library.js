import { useState } from 'preact/hooks';
import { addDays, shortDate, todayIso } from '../dates.js';
import { program } from '../program.js';
import * as repo from '../repo.js';
import { AskAiButton, AskAiModal, Chip, Modal, PageHeader, YouTubeEmbed, youtubeUrl } from './components.js';
import { formatKg, html, Icon, titleCase } from './core.js';

export function LibraryScreen() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(null);
  const [detail, setDetail] = useState(null);
  const [asking, setAsking] = useState(null);
  const groups = [...new Set(program.videos.map(v => v.muscleGroups))].sort();
  const q = query.trim().toLowerCase();
  const list = program.videos.filter(v =>
    (!group || v.muscleGroups === group)
    && (!q || v.name.toLowerCase().includes(q) || v.muscleGroups.toLowerCase().includes(q)));

  return html`
    <div class="page">
      <${PageHeader} title="Exercise library" sub=${`${program.videos.length} movements with form videos, your best and your last session.`}
        actions=${html`
          <label class="search">
            <${Icon} name="search" size=${18} />
            <input type="search" placeholder="Search exercises or muscles" aria-label="Search exercises or muscles"
                   value=${query} onInput=${e => setQuery(e.currentTarget.value)} />
          </label>`} />

      <div class="chips filter-row">
        <${Chip} selected=${!group} onClick=${() => setGroup(null)}>All<//>
        ${groups.map(g => html`<${Chip} selected=${group === g} onClick=${() => setGroup(group === g ? null : g)}>${g}<//>`)}
      </div>

      ${list.length === 0 && html`<div class="empty-state"><p>No exercise matches “${query}”.</p>
        <button type="button" class="text-button" onClick=${() => { setQuery(''); setGroup(null); }}>Clear search</button></div>`}

      <div class="library-grid">
        ${list.map(v => {
          const best = repo.personalBest(v.name);
          return html`
            <button type="button" key=${v.name} class="exercise-card" onClick=${() => setDetail(v)}>
              <span class="exercise-card-img">
                <img src=${`https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`} alt="" loading="lazy" />
                <span class="play"><${Icon} name="play" size=${20} /></span>
              </span>
              <span class="exercise-card-body">
                <span class="exercise-name">${v.name.toLowerCase()}</span>
                <span class="row">
                  <span class="muted small grow">${v.muscleGroups}</span>
                  ${best && html`<span class="small">Best <strong>${formatKg(best.weightKg)} kg</strong></span>`}
                </span>
              </span>
            </button>`;
        })}
      </div>
    </div>
    ${detail && html`<${DetailModal} video=${detail} onClose=${() => setDetail(null)}
      onAsk=${() => { setAsking(detail); setDetail(null); }} />`}
    ${asking && html`<${AskAiModal} onClose=${() => setAsking(null)} ctx=${{
      kind: 'exercise', title: asking.name.toLowerCase(), name: asking.name, reps: '', targetWeightKg: null, focus: asking.muscleGroups,
    }} />`}`;
}

function DetailModal({ video, onClose, onAsk }) {
  // "Last session": the most recent sets for this movement, up to six, as on the phone.
  const history = repo.previousSets(video.name, addDays(todayIso(), 1)).slice(0, 6);
  const best = repo.personalBest(video.name);
  return html`
    <${Modal} onClose=${onClose} size="wide" title=${titleCase(video.name)} actions=${html`
      <a class="text-button" href=${youtubeUrl(video.youtubeId)} target="_blank" rel="noopener">Open in YouTube</a>
      <span class="grow" />
      <${AskAiButton} onClick=${onAsk} />`}>
      <div class="detail-layout">
        <${YouTubeEmbed} id=${video.youtubeId} />
        <div>
          <p class="muted">${video.muscleGroups}</p>
          ${best
            ? html`<div class="pb"><span class="muted">Personal best</span>
                <span class="figure">${formatKg(best.weightKg)}<small> kg × ${best.reps}</small></span>
                <span class="muted small">${shortDate(best.day)}</span></div>`
            : html`<p class="muted">Not logged yet. Your best set will show here.</p>`}
          ${history.length > 0 && html`
            <h3>Last session</h3>
            <table class="data-table compact">
              <tbody>
                ${history.map(x => html`<tr><td class="muted">${shortDate(x.day)}</td><td>Set ${x.setIndex + 1}</td>
                  <td class="num">${formatKg(x.weightKg)} kg × ${x.reps}</td></tr>`)}
              </tbody>
            </table>`}
        </div>
      </div>
    <//>`;
}
