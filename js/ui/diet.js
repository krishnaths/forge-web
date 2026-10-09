import { useState } from 'preact/hooks';
import { todayIso } from '../dates.js';
import { mealPlan, program } from '../program.js';
import * as repo from '../repo.js';
import { settings } from '../settings.js';
import {
  AskAiButton, AskAiModal, Chip, DayTypeSwitch, Figure, PageHeader, Panel, ProgressBar, SelectableAskText,
  VideoModal, VideoThumb,
} from './components.js';
import { html, Icon } from './core.js';
import { dayActions } from './today.js';

export function DietScreen() {
  const [ask, setAsk] = useState(null);
  const [video, setVideo] = useState(null);
  const today = todayIso();
  const day = repo.dayTracker(today, settings().vegWeekdays);
  const actions = dayActions(today, () => day);
  const nextKey = repo.nextSlotForNow(day);

  return html`
    <div class="page">
      <${PageHeader} title="Diet" sub="Six meals a day. Tick each one as you follow it."
        actions=${html`
          <div class="diet-score">
            <${Figure} value=${day.mealsFollowed} unit=${` / ${day.mealsTotal} followed`} tone=${day.dietMet ? 'good' : ''} />
            <${ProgressBar} fraction=${day.mealsFollowed / day.mealsTotal} met=${day.dietMet} thin />
          </div>
          <${DayTypeSwitch} plan=${mealPlan} current=${day.dayType} onChange=${actions.setDayType} />`} />

      <div class="meal-grid">
        ${day.plan.slots.map(slot => html`
          <${MealSlotCard} key=${`${day.dayType}-${slot.key}`} slot=${slot} day=${day} next=${slot.key === nextKey}
            onSet=${(o, f) => actions.setMeal(slot.key, o, f)}
            onAsk=${text => setAsk({ kind: 'meal', title: slot.title.toLowerCase(), slot: slot.title, option: text })}
            onVideo=${setVideo} />`)}
      </div>

      <div class="grid pad-top-24">
        <${Panel} cls="span-12" title="Swaps"
          actions=${html`<span class="muted">When the prescribed item is not in the fridge</span>`}>
          ${mealPlan.note && html`<p class="note">${mealPlan.note}</p>`}
          <div class="swap-columns">
            ${Object.entries(program.swaps).map(([category, items]) => html`
              <div key=${category}>
                <h3>${category.charAt(0) + category.slice(1).toLowerCase()}</h3>
                <ul class="swap-list">${items.map(item => html`<li>${item.toLowerCase()}</li>`)}</ul>
              </div>`)}
          </div>
        <//>
      </div>
    </div>
    ${ask && html`<${AskAiModal} ctx=${ask} onClose=${() => setAsk(null)} />`}
    ${video && html`<${VideoModal} title=${video.title} id=${video.youtubeId} onClose=${() => setVideo(null)} />`}`;
}

function MealSlotCard({ slot, day, next, onSet, onAsk, onVideo }) {
  const followed = day.followed(slot.key);
  // What is on screen. Starts at whatever was last logged; picking an option on a ticked slot
  // re-records which one was eaten.
  const [shown, setShown] = useState(day.optionIndex(slot.key));
  const option = slot.options[shown] ?? slot.options[0];

  return html`
    <article class=${`panel meal-card ${followed ? 'followed' : ''} ${next && !followed ? 'next' : ''}`}>
      <div class="panel-head">
        <h2>${slot.title}</h2>
        ${next && !followed && html`<span class="next-tag">Next up</span>`}
        <span class="grow" />
        <${AskAiButton} onClick=${() => onAsk(option.lines.join('\n'))} />
      </div>
      ${slot.options.length > 1 && html`
        <div class="chips">
          ${slot.options.map((o, i) => html`
            <${Chip} selected=${shown === i} onClick=${() => { setShown(i); if (followed) onSet(i, true); }}>${o.title}<//>`)}
        </div>`}
      <ul class="lines">
        ${option.lines.map(line => html`<li><${SelectableAskText} text=${line} onAsk=${onAsk} /></li>`)}
      </ul>
      <div class="meal-foot">
        ${option.youtubeId && html`
          <${VideoThumb} id=${option.youtubeId} onClick=${() => onVideo(option)} />`}
        <span class="grow" />
        ${followed
          ? html`<button type="button" class="tonal-button followed-button" onClick=${() => onSet(shown, false)}
                         title="Click to untick">
              <${Icon} name="check" size=${18} cls="good" /> Followed</button>`
          : html`<button type="button" class="outlined-button" onClick=${() => onSet(shown, true)}>Mark followed</button>`}
      </div>
    </article>`;
}
