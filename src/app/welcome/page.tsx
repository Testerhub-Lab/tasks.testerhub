import Image from "next/image";
import Link from "next/link";
import "./welcome.css";

const columns = [
  { title: "К выполнению", tone: "todo", tasks: [
    { key: "PULSAR-128", title: "Спроектировать новую навигацию", tag: "Дизайн", person: "МК" },
    { key: "PULSAR-129", title: "Добавить быстрые фильтры задач", tag: "Разработка", person: "АС" },
  ] },
  { title: "В работе", tone: "progress", tasks: [
    { key: "PULSAR-124", title: "Собрать основу дизайн-системы", tag: "Дизайн", person: "АС" },
    { key: "PULSAR-125", title: "Настроить синхронизацию задач", tag: "Разработка", person: "ДВ" },
  ] },
  { title: "На проверке", tone: "review", tasks: [
    { key: "PULSAR-121", title: "Проверить роли и права доступа", tag: "Разработка", person: "ДВ" },
    { key: "PULSAR-122", title: "Адаптировать карточки для mobile", tag: "Дизайн", person: "АС" },
  ] },
  { title: "Готово", tone: "done", tasks: [
    { key: "PULSAR-118", title: "Обновить страницу проекта", tag: "Дизайн", person: "МК" },
    { key: "PULSAR-119", title: "Добавить ссылки на Wiki", tag: "Документация", person: "АС" },
  ] },
];

export default function WelcomePage() {
  return (
    <div className="pulsar-landing">
      <div className="pulsar-landing__content">
        <header className="pulsar-landing__nav">
          <Link href="/welcome" className="pulsar-landing__brand" aria-label="Pulsar — главная">
            <Image src="/pulsar.svg" width={48} height={48} alt="" priority />
            <span>Pulsar<span className="pulsar-landing__period">.</span></span>
          </Link>
          <nav aria-label="О продукте"><a href="#workspace">Пространство</a><a href="#knowledge">База знаний</a></nav>
          <Link href="/signin" className="button">Войти</Link>
        </header>
        <section className="pulsar-landing__hero">
          <p className="pulsar-landing__eyebrow">ЯСНОСТЬ В КАЖДОМ ДВИЖЕНИИ</p>
          <h1>Идеи становятся<br />ближе.</h1>
          <p className="pulsar-landing__intro">Вся команда. Единый фокус. Пространство для важного.</p>
          <Link href="/board" className="button button--primary">Войти в пространство <span aria-hidden="true">→</span></Link>
        </section>
        <section className="pulsar-landing__preview" id="workspace" aria-label="Пример рабочего пространства">
          <div className="pulsar-landing__preview-header"><span>PULSAR / РАБОЧЕЕ ПРОСТРАНСТВО</span><span>Демонстрационный проект</span></div>
          <div className="pulsar-landing__columns">
            {columns.map((column) => (
              <section key={column.tone} className="pulsar-landing__column">
                <h2><span className={`pulsar-landing__status pulsar-landing__status--${column.tone}`} />{column.title}</h2>
                {column.tasks.map((task) => (
                  <article key={task.key} className="pulsar-landing__task">
                    <span className="pulsar-landing__key">{task.key}</span>
                    <h3>{task.title}</h3>
                    <div><span className="pulsar-landing__tag">{task.tag}</span><span className="pulsar-landing__avatar">{task.person}</span></div>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </section>
        <section className="pulsar-landing__story" id="knowledge">
          <p className="pulsar-landing__eyebrow">ВСЁ В ОДНОЙ ОРБИТЕ</p>
          <h2>Меньше шума.<br />Больше движения.</h2>
          <div className="pulsar-landing__features">
            <div><span className="pulsar-landing__eyebrow">01 / ЗАДАЧИ</span><h3>От мысли к действию</h3><p>Доска для общего обзора, список для деталей. Приоритеты и участники рядом с каждой задачей.</p></div>
            <div><span className="pulsar-landing__eyebrow">02 / КОНТЕКСТ</span><h3>Знания остаются с командой</h3><p>База знаний рядом с работой. Решения и документация формируют общий контекст проекта.</p></div>
            <div><span className="pulsar-landing__eyebrow">03 / ФОКУС</span><h3>Главное всегда ближе</h3><p>Свои задачи, нужный проект, точный поиск. Пространство, в котором легко найти следующий шаг.</p></div>
          </div>
        </section>
        <section className="pulsar-landing__cta">
          <Image src="/pulsar.svg" width={90} height={90} alt="" />
          <h2>У больших идей<br />есть своя орбита.</h2>
          <Link href="/board" className="button button--primary">Открыть пространство <span aria-hidden="true">→</span></Link>
        </section>
        <footer className="pulsar-landing__footer"><span>Всё в одной орбите.</span><span>Pulsar</span></footer>
      </div>
    </div>
  );
}
