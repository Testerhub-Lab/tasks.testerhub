/* Standalone concept. All records below are fictional; edits stay in memory. */
const $ = (selector, root = document) => root.querySelector(selector);
const icon = (name) => `<svg aria-hidden="true"><use href="#${name}"/></svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const statuses = { TODO: 'К выполнению', IN_PROGRESS: 'В работе', TESTING: 'На проверке', DONE: 'Готово' };
const priorities = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
const people = { 'АС': { name: 'Александр', style: 'avatar-me' }, 'МК': { name: 'Мария', style: 'warm' }, 'ДВ': { name: 'Дмитрий', style: 'sage' } };
const tasks = [
  { id: 128, title: 'Спроектировать новую навигацию', status: 'TODO', priority: 'high', tag: 'Дизайн', person: 'МК', comments: 3, project: 'PULSAR', description: 'Собрать основные сценарии навигации: проекты, задачи и база знаний. Подготовить desktop и mobile варианты.' },
  { id: 129, title: 'Добавить быстрые фильтры задач', status: 'TODO', priority: 'medium', tag: 'Разработка', person: 'АС', comments: 2, project: 'PULSAR' },
  { id: 130, title: 'Обновить документацию API', status: 'TODO', priority: 'low', tag: 'Документация', person: 'ДВ', comments: 0, project: 'PULSAR' },
  { id: 124, title: 'Собрать основу дизайн-системы', status: 'IN_PROGRESS', priority: 'high', tag: 'Дизайн', person: 'АС', comments: 8, project: 'PULSAR', description: 'Определить палитру, типографику, сетку и общие состояния компонентов. Собрать первый UI-kit в новом визуальном языке Pulsar.' },
  { id: 125, title: 'Настроить синхронизацию задач', status: 'IN_PROGRESS', priority: 'medium', tag: 'Разработка', person: 'ДВ', comments: 4, project: 'PULSAR' },
  { id: 126, title: 'Продумать сценарий приглашения', status: 'IN_PROGRESS', priority: 'medium', tag: 'Продукт', person: 'МК', comments: 2, project: 'PULSAR' },
  { id: 121, title: 'Проверить роли и права доступа', status: 'TESTING', priority: 'high', tag: 'Разработка', person: 'ДВ', comments: 5, project: 'PULSAR' },
  { id: 122, title: 'Адаптировать карточки для mobile', status: 'TESTING', priority: 'medium', tag: 'Дизайн', person: 'АС', comments: 3, project: 'PULSAR' },
  { id: 118, title: 'Обновить страницу проекта', status: 'DONE', priority: 'medium', tag: 'Дизайн', person: 'МК', comments: 6, project: 'PULSAR' },
  { id: 119, title: 'Добавить ссылки на Wiki', status: 'DONE', priority: 'low', tag: 'Документация', person: 'АС', comments: 1, project: 'PULSAR' },
  { id: 41, title: 'Обновить каталог курсов', status: 'TODO', priority: 'high', tag: 'Дизайн', person: 'МК', comments: 2, project: 'LMS' },
  { id: 42, title: 'Добавить прогресс прохождения', status: 'IN_PROGRESS', priority: 'medium', tag: 'Разработка', person: 'АС', comments: 3, project: 'LMS' },
  { id: 43, title: 'Проверить создание урока', status: 'TESTING', priority: 'medium', tag: 'Продукт', person: 'ДВ', comments: 1, project: 'LMS' },
  { id: 44, title: 'Подготовить структуру базы знаний', status: 'DONE', priority: 'low', tag: 'Документация', person: 'АС', comments: 0, project: 'LMS' },
];
const state = { page: ['workspace','landing','kit','brand'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'workspace', project: 'PULSAR', view: 'board', side: 'all', priority: 'all', query: '', editing: null };
const avatar = (person) => `<span class="avatar ${people[person].style}" title="${people[person].name}">${person}</span>`;
const tagClass = (tag) => tag === 'Документация' ? 'sage' : tag === 'Продукт' ? 'sand' : '';
const taskCard = (task, interactive = true) => `<${interactive ? 'button type="button"' : 'div'} class="task-card" ${interactive ? `data-task="${task.id}" aria-label="Открыть ${task.project}-${task.id}: ${escapeHtml(task.title)}"` : ''}>
  <span class="task-card-top"><span class="task-key">${task.project}-${task.id}</span><span class="priority ${task.priority}" role="img" aria-label="Приоритет: ${priorities[task.priority]}" title="${priorities[task.priority]} приоритет"><i></i><i></i><i></i></span></span>
  <h3>${escapeHtml(task.title)}</h3><span class="task-card-footer"><span class="tag ${tagClass(task.tag)}">${escapeHtml(task.tag)}</span><span class="task-meta">${task.comments ? `<span>${icon('message')}${task.comments}</span>` : ''}${avatar(task.person)}</span></span></${interactive ? 'button' : 'div'}>`;
const buttonCreate = (status = 'TODO', label = 'Новая задача') => `<button class="button primary" data-create="${status}">${icon('plus')}${label}</button>`;
const projectName = () => state.project === 'PULSAR' ? 'Pulsar' : 'EasyCourse';
function filteredTasks() {
  const query = state.query.trim().toLocaleLowerCase('ru');
  return tasks.filter((task) => task.project === state.project && (state.side !== 'mine' || task.person === 'АС') && (state.priority === 'all' || task.priority === state.priority) && (!query || `${task.title} ${task.project}-${task.id} ${task.tag}`.toLocaleLowerCase('ru').includes(query)));
}
function renderWorkspace() {
  const projectTasks = tasks.filter((task) => task.project === state.project);
  const visible = filteredTasks();
  return `<section aria-label="Задачи проекта"><h1 class="sr-only">${state.side === 'mine' ? 'Мои задачи' : projectName()}</h1>
  <div class="board-toolbar"><div class="view-tabs" aria-label="Вид задач"><button data-view="board" class="${state.view === 'board' ? 'active' : ''}" aria-pressed="${state.view === 'board'}">${icon('board')}Доска</button><button data-view="list" class="${state.view === 'list' ? 'active' : ''}" aria-pressed="${state.view === 'list'}">${icon('list')}Список</button></div><div class="filters"><label class="filter-select">${icon('filter')}<select id="priority-filter" aria-label="Фильтр по приоритету"><option value="all">Все приоритеты</option>${Object.entries(priorities).map(([key,label]) => `<option value="${key}" ${state.priority === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><span class="filter-count">${visible.length} из ${projectTasks.length} задач</span></div></div>
  ${state.view === 'board' ? `<div class="board">${Object.entries(statuses).map(([key,label]) => `<section class="column" aria-label="${label}"><div class="column-header"><span class="status-dot ${key}"></span>${label}<span class="count">${visible.filter(task=>task.status===key).length}</span><button class="icon-button" data-create="${key}" aria-label="Добавить задачу: ${label}">${icon('plus')}</button></div>${visible.filter(task=>task.status===key).map(task=>taskCard(task)).join('')}<button class="column-add" data-create="${key}">${icon('plus')}Добавить задачу</button></section>`).join('')}</div>${!visible.length ? '<p class="empty-state">Задачи не найдены. Попробуйте изменить поиск или фильтры.</p>' : ''}` : renderList(visible)}
  </section>`;
}
function renderList(visible) {
  if (!visible.length) return '<p class="empty-state">Задачи не найдены. Попробуйте изменить поиск или фильтры.</p>';
  return `<div class="table-wrap"><table class="task-table"><thead><tr><th>Ключ</th><th>Задача</th><th>Статус</th><th>Приоритет</th><th>Участник</th></tr></thead><tbody>${visible.map(task=>`<tr><td class="task-key">${task.project}-${task.id}</td><td><button data-task="${task.id}">${escapeHtml(task.title)}</button></td><td><span class="status-cell"><span class="status-dot ${task.status}"></span>${statuses[task.status]}</span></td><td>${priorities[task.priority]}</td><td>${avatar(task.person)}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderKit() {
  const colors = [['Canvas','#0B1013'],['Surface','#12191D'],['Raised','#1B242A'],['Border','#29343B'],['Silver','#C5D9E4'],['Text','#E6EDF0']];
  return `<section class="kit-heading"><span class="eyebrow">PULSAR DESIGN SYSTEM / 01</span><h1>Единый язык. Любой масштаб.</h1><p>Графитовые поверхности, серебряный акцент и спокойная типографика. Базовые токены и компоненты для нового пространства Pulsar.</p></section><div class="kit-grid">
  <section class="kit-panel wide"><div class="panel-top"><h2>Палитра</h2><span>FOUNDATIONS / COLOR</span></div><div class="swatches">${colors.map(([name,color])=>`<div class="swatch"><div class="swatch-block" style="--swatch:${color}"></div><strong>${name}</strong><code>${color}</code></div>`).join('')}</div></section>
  <section class="kit-panel"><div class="panel-top"><h2>Типографика</h2><span>01 / TYPE</span></div><div class="type-display">Пространство<br>для важного.</div><div class="type-heading">Фокус на результате</div><p class="type-body">Спокойный ритм. Чёткая иерархия. Живые идеи.</p><div class="type-caption">SEGOE UI / SYSTEM SANS · 12 / 22 / 35</div></section>
  <section class="kit-panel"><div class="panel-top"><h2>Кнопки и действия</h2><span>02 / ACTIONS</span></div><div class="component-row">${buttonCreate('TODO','Создать задачу')}<button class="button secondary" data-demo="Изменения сохранены">Сохранить</button></div><div class="component-row"><button class="button ghost" data-page="brand">Подробнее ${icon('arrow')}</button><button class="button secondary" disabled>Недоступно</button><button class="icon-button" data-create="TODO" aria-label="Добавить задачу">${icon('plus')}</button></div><div class="sample-alert">${icon('check')}Изменения успешно сохранены</div></section>
  <section class="kit-panel"><div class="panel-top"><h2>Поля и управление</h2><span>03 / INPUTS</span></div><label class="field-label">Название проекта<input class="input" placeholder="Например, Pulsar" maxlength="60"></label><label class="field-label">Ключ проекта<input class="input error" value="PUL SAR" aria-invalid="true" aria-describedby="kit-key-error"><span class="field-error" id="kit-key-error">Только латинские буквы и цифры, без пробелов</span></label><div class="component-row"><label class="toggle-label"><input type="checkbox" checked>Уведомления</label><label class="checkbox-label"><input type="checkbox" checked>Только мои задачи</label></div></section>
  <section class="kit-panel"><div class="panel-top"><h2>Статусы и метки</h2><span>04 / FEEDBACK</span></div><div class="component-row">${Object.entries(statuses).map(([key,label])=>`<span class="status-badge"><span class="status-dot ${key}"></span>${label}</span>`).join('')}</div><div class="component-row"><span class="tag">Дизайн</span><span class="tag sage">Документация</span><span class="tag sand">Продукт</span></div><div class="component-row">${avatar('АС')}${avatar('МК')}${avatar('ДВ')}<span class="type-body">Команда в одной орбите</span></div></section>
  <section class="kit-panel"><div class="panel-top"><h2>Карточка задачи</h2><span>05 / COMPOSITE</span></div><div class="kit-card-sample">${taskCard(tasks[3])}</div><p class="type-body">Ключ, приоритет, контекст и участник.<br>Наведите или откройте карточку.</p></section>
  <section class="kit-panel"><div class="panel-top"><h2>Геометрия и состояния</h2><span>06 / TOKENS</span></div><div class="token-row"><span>Сетка отступов</span><code>4 · 8 · 12 · 16 · 24 · 32</code></div><div class="token-row"><span>Скругления</span><code>4 / 7 / 10 / 14 px</code></div><div class="token-row"><span>Границы</span><code>1 px / silver 8–18%</code></div><div class="token-row"><span>Фокус клавиатуры</span><code>2 px / #C5D9E4</code></div><div class="token-row"><span>Микровзаимодействия</span><code>180 ms / reduced-motion</code></div></section></div>`;
}
function renderBrand() {
  return `<section class="brand-heading"><span class="eyebrow">PULSAR / BRAND DIRECTION</span><h1>Одна точка. Бесконечное движение.</h1><p>Светящийся центр и тонкий диагональный луч. Новый знак сохраняет характер референса: тишина, энергия и точное направление.</p></section><section class="brand-stage" aria-label="Знак и логотип Pulsar"><img src="logo.svg" alt="Светлая точка на диагональном луче"><div class="brand-stage-word">Pulsar</div><div class="brand-stage-caption">YOUR IDEAS. ONE ORBIT.</div></section><div class="brand-specs"><section class="kit-panel"><span class="eyebrow">01 / ЗНАК</span><h2>Энергия в одной точке</h2><p>Серебряный луч под 45°, яркое ядро и мягкий холодный ореол. Знак работает отдельно и рядом с названием.</p><a class="button ghost" href="logo.svg" download="pulsar-logo.svg" style="margin-top:14px;padding-left:0">Скачать знак SVG ${icon('arrow')}</a></section><section class="kit-panel"><span class="eyebrow">02 / АТМОСФЕРА</span><h2>Глубина вместо шума</h2><p>Почти чёрный фон и холодное свечение в верхней части. Слои создают глубину без ярких цветных пятен.</p><div class="gradient-demo"></div></section><section class="kit-panel"><span class="eyebrow">03 / ХАРАКТЕР</span><h2>Спокойная уверенность</h2><p>Чистая типографика, тонкие линии и свободное пространство. Цвет помогает действовать, а свет отмечает главное.</p><button class="button ghost" data-page="kit" style="margin-top:14px;padding-left:0">Посмотреть UI-kit ${icon('arrow')}</button></section></div>`;
}
function renderLanding() {
  return `<div class="landing-content">
    <nav class="landing-nav" aria-label="Навигация лендинга"><a href="#landing" class="brand"><img src="logo.svg" alt="" width="48" height="48"><span>Pulsar<span class="brand-period">.</span></span></a><button class="button secondary" data-page="workspace">Открыть демо ${icon('arrow')}</button></nav>
    <section class="page-heading landing-hero"><div><span class="eyebrow">ЯСНОСТЬ В КАЖДОМ ДВИЖЕНИИ</span><h1>Идеи становятся<br>ближе.</h1><p>Вся команда. Единый фокус. Пространство для важного.</p><button class="button primary" data-page="workspace">Войти в пространство ${icon('arrow')}</button><span class="landing-demo-note">Интерактивный прототип · демоданные</span></div></section>
    <section class="landing-preview" aria-label="Пример рабочего пространства"><div class="landing-preview-header"><span><span class="live-dot"></span> PULSAR / РАБОЧЕЕ ПРОСТРАНСТВО</span><button class="button ghost" data-page="workspace">Исследовать ${icon('arrow')}</button></div><div class="board">${Object.entries(statuses).map(([key,label])=>`<section class="column" aria-label="${label}"><div class="column-header"><span class="status-dot ${key}"></span>${label}</div>${tasks.filter(task=>task.project==='PULSAR'&&task.status===key).slice(0,2).map(task=>taskCard(task,false)).join('')}</section>`).join('')}</div></section>
    <section class="landing-story"><span class="eyebrow">ВСЁ В ОДНОЙ ОРБИТЕ</span><h2>Меньше шума.<br>Больше движения.</h2><div class="landing-features"><div><span class="eyebrow">01 / ЗАДАЧИ</span><h3>От мысли к действию</h3><p>Доска для общего обзора, список для деталей. Приоритеты и участники рядом с каждой задачей.</p></div><div><span class="eyebrow">02 / КОНТЕКСТ</span><h3>Знания остаются с командой</h3><p>База знаний рядом с работой. Решения и документация формируют общий контекст проекта.</p></div><div><span class="eyebrow">03 / ФОКУС</span><h3>Главное всегда ближе</h3><p>Свои задачи, нужный проект, точный поиск. Пространство, в котором легко найти следующий шаг.</p></div></div></section>
    <section class="landing-cta"><img src="logo.svg" alt="" width="90" height="90"><h2>У больших идей<br>есть своя орбита.</h2><button class="button primary" data-page="workspace">Открыть пространство ${icon('arrow')}</button><p>Прототип новой концепции Pulsar</p></section>
  </div>`;
}
function renderWiki() {
  return `<article class="wiki-page"><span class="eyebrow">БАЗА ЗНАНИЙ / ${state.project}</span><h1>Добро пожаловать в ${projectName()}.</h1><p class="intro">Общий контекст помогает двигаться быстрее. Здесь команда собирает решения, описывает процессы и превращает опыт в знания.</p><span class="status-badge">${icon('book')}Демонстрационная страница</span><h2>От идеи до результата</h2><div class="wiki-step"><span>01</span><div><strong>Сформулируйте задачу</strong><p>Добавьте понятный заголовок, контекст и ожидаемый результат. Выберите приоритет.</p></div></div><div class="wiki-step"><span>02</span><div><strong>Держите фокус</strong><p>Используйте доску для общего обзора, список для деталей и фильтры для текущего приоритета.</p></div></div><div class="wiki-step"><span>03</span><div><strong>Сохраняйте решения</strong><p>Задачи меняют статус, а знания остаются. Фиксируйте принятые решения в Wiki.</p></div></div><div class="wiki-callout">В этом прототипе можно создавать задачи, редактировать их название, описание, приоритет и статус. Данные демонстрационные и хранятся до обновления страницы.</div><button class="button secondary" data-side="all" style="margin-top:24px">К задачам проекта ${icon('arrow')}</button></article>`;
}
function render() {
  document.body.classList.toggle('landing-page',state.page==='landing');
  document.body.classList.toggle('workspace-page',state.page==='workspace'&&state.side!=='wiki');
  $('#main').innerHTML = state.page === 'landing' ? renderLanding() : state.page === 'kit' ? renderKit() : state.page === 'brand' ? renderBrand() : state.side === 'wiki' ? renderWiki() : renderWorkspace();
  document.querySelectorAll('.concept-nav [data-page]').forEach(button=>{button.classList.toggle('active',button.dataset.page===state.page);if(button.dataset.page===state.page)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  document.querySelectorAll('.side-nav [data-side]').forEach(button=>{const active=state.page==='workspace'&&button.dataset.side===state.side;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  document.querySelectorAll('[data-project]').forEach(button=>{const active=button.dataset.project===state.project;button.classList.toggle('project-active',active);button.setAttribute('aria-pressed',String(active));const dot=$('.project-dot',button);if(dot)dot.remove();if(active)button.insertAdjacentHTML('beforeend','<span class="project-dot"></span>');});
  $('#breadcrumb').textContent = state.page === 'kit' ? 'UI-kit' : state.page === 'brand' ? 'Бренд' : state.side === 'mine' ? 'Мои задачи' : state.side === 'wiki' ? 'База знаний' : projectName();
  $('#quick-create').hidden = state.page !== 'workspace';
  $('#total-count').textContent = tasks.filter(task=>task.project===state.project).length;
  $('#mine-count').textContent = tasks.filter(task=>task.project===state.project&&task.person==='АС').length;
  $('#search').disabled = state.page !== 'workspace' || state.side === 'wiki';
}
function changePage(page) { state.page=page;history.replaceState(null,'',`#${page}`);render();window.scrollTo(0,0); }
function closeSidebar() { $('#sidebar').classList.remove('open');$('.mobile-menu').setAttribute('aria-expanded','false'); }
let selectedAttachments = [];
function updateEditorProperties() {
  const form = $('#task-form');
  $('#editor-status-dot').className = `status-dot ${form.elements.status.value}`;
  $('#editor-priority-bars').className = `priority ${form.elements.priority.value}`;
  $('.editor-project .project-icon').textContent = form.elements.project.value === 'PULSAR' ? 'P' : 'E';
  $('#save-task').disabled = !form.elements.title.value.trim();
}
function renderAttachments() {
  $('#editor-attachments').innerHTML = selectedAttachments.map((name,index)=>`<span class="editor-file">${icon('paperclip')}<span>${escapeHtml(name)}</span><button type="button" data-remove-file="${index}" aria-label="Убрать ${escapeHtml(name)}">${icon('close')}</button></span>`).join('');
}
function openTask(id = null, status = 'TODO') {
  const task = id === null ? null : tasks.find(item=>item.id===Number(id));
  state.editing = task ? task.id : null;
  const form = $('#task-form');form.reset();
  form.elements.title.value=task?.title || '';
  form.elements.description.value=task?.description || '';
  form.elements.status.value=task?.status || status;
  form.elements.priority.value=task?.priority || 'medium';
  form.elements.project.value=task?.project || state.project;
  form.elements.person.value=task?.person || 'АС';
  form.elements.type.value=task?.type || 'Task';
  form.elements.tag.value=task?.tag || 'Продукт';
  selectedAttachments=[...(task?.attachments || [])];renderAttachments();
  $('#dialog-key').textContent=task ? `${task.project}-${task.id}` : '';
  $('#dialog-title').textContent=task ? 'Редактирование задачи' : 'Новая задача';
  $('#save-task').textContent=task ? 'Сохранить' : 'Создать задачу';
  updateEditorProperties();
  $('#task-dialog').showModal();
  form.elements.title.focus();
}
let toastTimer;
function toast(message) { clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3000); }
document.addEventListener('click',event=>{
  const target=event.target.closest('button,a');if(!target)return;
  if(target.matches('.brand')){event.preventDefault();state.side='all';changePage(target.getAttribute('href')==='#landing'?'landing':'workspace');closeSidebar();}
  if(target.dataset.page){changePage(target.dataset.page);closeSidebar();}
  if(target.dataset.side){state.side=target.dataset.side;changePage('workspace');closeSidebar();}
  if(target.dataset.project){state.project=target.dataset.project;state.side='all';state.query='';$('#search').value='';changePage('workspace');closeSidebar();}
  if(target.dataset.view){state.view=target.dataset.view;render();}
  if(target.dataset.create)openTask(null,target.dataset.create);
  if(target.dataset.task)openTask(target.dataset.task);
  if(target.hasAttribute('data-close'))$('#task-dialog').close();
  if(target.hasAttribute('data-remove-file')){selectedAttachments.splice(Number(target.dataset.removeFile),1);renderAttachments();}
  if(target.dataset.demo)toast(target.dataset.demo);
  if(target.matches('.mobile-menu')){const open=$('#sidebar').classList.toggle('open');target.setAttribute('aria-expanded',String(open));}
});
document.addEventListener('change',event=>{if(event.target.id==='priority-filter'){state.priority=event.target.value;render();$('#priority-filter').focus();}});
$('#search').addEventListener('input',event=>{state.query=event.target.value;render();});
document.addEventListener('keydown',event=>{
  const typing=event.target.matches('input,textarea,select,[contenteditable="true"]');
  if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&$('#task-dialog').open){event.preventDefault();if(!$('#save-task').disabled)$('#task-form').requestSubmit();}
  if(event.key==='/'&&!typing&&!$('#task-dialog').open&&!$('#search').disabled){event.preventDefault();$('#search').focus();}
  if(event.key.toLowerCase()==='c'&&!typing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!$('#task-dialog').open&&state.page==='workspace'){event.preventDefault();openTask();}
  if(event.key==='Escape')closeSidebar();
});
$('#task-dialog').addEventListener('click',event=>{if(event.target===$('#task-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
$('#task-form').addEventListener('submit',event=>{
  event.preventDefault();const form=event.target;const title=form.elements.title.value.trim();
  if(!title){form.elements.title.setCustomValidity('Введите название задачи');form.elements.title.reportValidity();return;}
  const values={title,description:form.elements.description.value.trim(),status:form.elements.status.value,priority:form.elements.priority.value,project:form.elements.project.value,person:form.elements.person.value,type:form.elements.type.value,tag:form.elements.tag.value,attachments:[...selectedAttachments]};
  const existing=tasks.find(task=>task.id===state.editing);
  if(existing)Object.assign(existing,values);else tasks.push({id:Math.max(...tasks.map(task=>task.id))+1,comments:0,...values});
  state.project=values.project;
  $('#task-dialog').close();render();toast(existing?'Изменения сохранены':'Новая задача уже на вашей орбите');
});
$('#task-form').elements.title.addEventListener('input',event=>{event.target.setCustomValidity('');updateEditorProperties();});
$('#task-form').addEventListener('change',updateEditorProperties);
$('#task-files').addEventListener('change',event=>{selectedAttachments.push(...Array.from(event.target.files,file=>file.name));renderAttachments();event.target.value='';});
window.addEventListener('hashchange',()=>{const page=location.hash.slice(1);if(['workspace','landing','kit','brand'].includes(page)){state.page=page;render();}});
render();
