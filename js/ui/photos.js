import { useEffect, useRef, useState } from 'preact/hooks';
import * as db from '../db.js';
import { shortDate, todayIso, weekStart } from '../dates.js';
import * as repo from '../repo.js';
import { Modal, PageHeader, Panel } from './components.js';
import { html, Icon } from './core.js';

const ANGLES = ['FRONT', 'BACK', 'SIDE'];
const angleName = a => a.charAt(0) + a.slice(1).toLowerCase();

/** Photos are blobs in this browser's IndexedDB. They are never synced. */
function usePhotoUrl(photo) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!photo) { setUrl(null); return undefined; }
    let objectUrl = null;
    let live = true;
    db.getBlob(`${photo.day}|${photo.angle}`).then(blob => {
      if (live && blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photo?.day, photo?.angle, photo?.capturedAt]);
  return url;
}

/** Read-only thumbnail, used on Progress. */
export function PhotoThumb({ photo, angle }) {
  const url = usePhotoUrl(photo);
  return html`
    <a class="photo-slot small" href="#/photos" aria-label=${`${angleName(angle)} photo`}>
      ${url ? html`<img src=${url} alt="" />` : html`<span class="muted small">${angleName(angle)}</span>`}
    </a>`;
}

function Slot({ angle, photo, onOpen, onAdd }) {
  const url = usePhotoUrl(photo);
  return html`
    <figure class="photo-cell">
      <button type="button" class=${`photo-slot ${photo ? '' : 'empty'}`} onClick=${photo ? onOpen : onAdd}
              aria-label=${photo ? `View ${angleName(angle)} photo` : `Add ${angleName(angle)} photo`}>
        ${url ? html`<img src=${url} alt="" />` : photo ? null : html`
          <span class="add-photo"><${Icon} name="add" cls="accent" /> Add ${angleName(angle).toLowerCase()} photo</span>`}
      </button>
      <figcaption class="muted small">${angleName(angle)}${photo ? `, ${shortDate(photo.day)}` : ''}</figcaption>
    </figure>`;
}

export function PhotosScreen() {
  const [viewing, setViewing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const input = useRef(null);
  const pendingAngle = useRef(null);
  const today = todayIso();
  const photos = repo.photos();

  const byWeek = new Map();
  for (const p of photos) {
    const wk = weekStart(p.day);
    (byWeek.get(wk) ?? byWeek.set(wk, []).get(wk)).push(p);
  }
  const thisWeekStart = weekStart(today);
  const thisWeek = byWeek.get(thisWeekStart) ?? [];
  const earlier = [...byWeek.entries()].filter(([wk]) => wk !== thisWeekStart).sort((a, b) => b[0].localeCompare(a[0]));

  const pick = angle => {
    pendingAngle.current = angle;
    input.current.value = '';
    input.current.click();
  };
  const onFile = e => {
    const file = e.currentTarget.files?.[0];
    if (file && pendingAngle.current) repo.registerPhoto(today, pendingAngle.current, file);
    pendingAngle.current = null;
  };

  return html`
    <div class="page">
      <${PageHeader} title="Progress photos"
        sub="Empty stomach, same clothes as day 1, same spot and lighting. Photos stay in this browser and are never uploaded." />

      <div class="grid">
        <${Panel} cls="span-12" title=${`This week, from ${shortDate(thisWeekStart)}`}>
          <div class="photo-row">
            ${ANGLES.map(angle => {
              const p = thisWeek.find(x => x.angle === angle);
              return html`<${Slot} angle=${angle} photo=${p} onOpen=${() => setViewing(p)} onAdd=${() => pick(angle)} />`;
            })}
          </div>
        <//>
        ${earlier.map(([wk, list]) => html`
          <${Panel} key=${wk} cls="span-12" title=${`Week of ${shortDate(wk)}`}>
            <div class="photo-row">
              ${ANGLES.map(angle => {
                const p = list.find(x => x.angle === angle);
                return p ? html`<${Slot} angle=${angle} photo=${p} onOpen=${() => setViewing(p)} />`
                  : html`<figure class="photo-cell"><div class="photo-slot missing muted small">No ${angle.toLowerCase()} photo</div></figure>`;
              })}
            </div>
          <//>`)}
      </div>
      <input ref=${input} type="file" accept="image/*" capture="environment" hidden onChange=${onFile} />
    </div>
    ${viewing && html`<${Viewer} photo=${viewing} onClose=${() => setViewing(null)}
      onRetake=${viewing.day === today ? () => { setViewing(null); pick(viewing.angle); } : null}
      onDelete=${() => { setConfirmDelete(viewing); setViewing(null); }} />`}
    ${confirmDelete && html`
      <${Modal} title="Delete this photo?" onClose=${() => setConfirmDelete(null)} actions=${html`
        <button type="button" class="text-button" onClick=${() => setConfirmDelete(null)}>Keep photo</button>
        <button type="button" class="filled-button danger-button"
                onClick=${() => { repo.deletePhoto(confirmDelete); setConfirmDelete(null); }}>Delete photo</button>`}>
        <p>It exists only in this browser, so deleting it cannot be undone.</p>
      <//>`}`;
}

function Viewer({ photo, onClose, onDelete, onRetake }) {
  const url = usePhotoUrl(photo);
  return html`
    <${Modal} onClose=${onClose} size="wide" title=${`${angleName(photo.angle)}, ${shortDate(photo.day)}`} actions=${html`
      <button type="button" class="text-button danger" onClick=${onDelete}><${Icon} name="trash" size=${18} /> Delete</button>
      <span class="grow" />
      ${onRetake && html`<button type="button" class="outlined-button" onClick=${onRetake}>Replace photo</button>`}`}>
      <div class="viewer">${url && html`<img src=${url} alt=${`${angleName(photo.angle)} progress photo`} />`}</div>
    <//>`;
}
