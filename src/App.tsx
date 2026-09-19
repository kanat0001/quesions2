import { useEffect, useMemo, useState } from "react";
import Python from './data/Python.json'

import type { LearnStatus, ProgressMap, QuestionItem } from "./types";
import { loadProgress, resetProgress, setStatus } from "./storage";
import { makeTopics, normalize, shuffle, STATUS_LABEL } from "./utils";

type Mode = "list" | "train";
const ALL_TOPICS_ID = "__all__";
const THEME_KEY = "qa-trainer-theme-v1";
type Theme = "light" | "dark";


function getStatus(progress: ProgressMap, id: string): LearnStatus {
  return progress[id] ?? "unlearned";
}

function statusBadge(status: LearnStatus) {
  return <span className="badge">{STATUS_LABEL[status]}</span>;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

function getInitialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY) as Theme | null;
  if (saved === "light" || saved === "dark") return saved;

  // если не сохраняли — берём из системной
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  return prefersDark ? "dark" : "light";
}

export default function App() {
  const questions = [
  ...Python,
] as QuestionItem[];

  const [progress, setProgress] = useState<ProgressMap>({});
  const [selectedTopicId, setSelectedTopicId] = useState<string>(ALL_TOPICS_ID);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LearnStatus | "all">("all");

  const [mode, setMode] = useState<Mode>("list");
  const [openAnswer, setOpenAnswer] = useState<Record<string, boolean>>({});

  // training mode
  const [trainOrder, setTrainOrder] = useState<string[]>([]);
  const [trainIndex, setTrainIndex] = useState(0);
  const [trainShowAnswer, setTrainShowAnswer] = useState(false);
  const [trainShuffle, setTrainShuffle] = useState(true);

  // focus UI: drawers
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // theme
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const topics = useMemo(() => makeTopics(questions, progress), [questions, progress]);

  const overall = useMemo(() => {
    const total = questions.length;
    let learned = 0;
    for (const q of questions) if (getStatus(progress, q.id) === "learned") learned++;
    const percent = total === 0 ? 0 : Math.round((learned / total) * 100);
    return { total, learned, percent };
  }, [questions, progress]);

  const selectedTopicTitle = useMemo(() => {
    if (selectedTopicId === ALL_TOPICS_ID) return "Все темы";
    const t = topics.find((x) => x.id === selectedTopicId);
    return t?.title ?? "Тема";
  }, [selectedTopicId, topics]);

  const filteredQuestions = useMemo(() => {
    const q = normalize(search);

    return questions.filter((item) => {
      if (selectedTopicId !== ALL_TOPICS_ID && item.topicId !== selectedTopicId) return false;

      if (q) {
        const inQuestion = normalize(item.question).includes(q);
        const inTags = (item.tags ?? []).some((t) => normalize(t).includes(q));
        if (!inQuestion && !inTags) return false;
      }

      const st = getStatus(progress, item.id);
      if (statusFilter !== "all" && st !== statusFilter) return false;

      return true;
    });
  }, [questions, selectedTopicId, search, statusFilter, progress]);

  const startTraining = () => {
    const ids = filteredQuestions.map((x) => x.id);
    const order = trainShuffle ? shuffle(ids) : ids;
    setTrainOrder(order);
    setTrainIndex(0);
    setTrainShowAnswer(false);
    setMode("train");
    setTopicsOpen(false);
    setSettingsOpen(false);
  };

  const currentTrainItem = useMemo(() => {
    if (mode !== "train") return null;
    const id = trainOrder[trainIndex];
    return questions.find((q) => q.id === id) ?? null;
  }, [mode, trainOrder, trainIndex, questions]);

  const setQuestionStatus = (id: string, status: LearnStatus) => {
    setProgress((prev) => setStatus(prev, id, status));
  };

  const onReset = () => {
    const ok = confirm("Сбросить прогресс? Это удалит статусы из localStorage.");
    if (!ok) return;
    setProgress(resetProgress());
    setOpenAnswer({});
    setMode("list");
    setTrainOrder([]);
    setTrainIndex(0);
    setTrainShowAnswer(false);
  };

  const pickTopic = (topicId: string) => {
    setSelectedTopicId(topicId);
    setTopicsOpen(false);
  };

  const closeAll = () => {
    setTopicsOpen(false);
    setSettingsOpen(false);
  };

  const renderList = () => {
    if (filteredQuestions.length === 0) {
      return (
        <div className="card">
          <div className="muted">Ничего не найдено по текущим фильтрам.</div>
        </div>
      );
    }

    return filteredQuestions.map((q) => {
  const key = `${q.topicId}-${q.id}`;

  const st = getStatus(progress, q.id);
  const isOpen = !!openAnswer[key];

  return (
    <div className="card" key={key}>
      <div className="cardTop">
        <div className="cardTopLeft">
          <p className="qTitle">{q.question}</p>
          <div className="muted small">
            {q.topicTitle} • {statusBadge(st)}
            {q.tags?.length ? <> • tags: {q.tags.join(", ")}</> : null}
          </div>
        </div>

        <button
          className="button"
          onClick={() =>
            setOpenAnswer((prev) => ({
              ...prev,
              [key]: !prev[key],
            }))
          }
        >
          {isOpen ? "Скрыть" : "Ответ"}
        </button>
      </div>

      {isOpen && <div className="answer">{q.answer}</div>}

      <div className="actions">
        <button className="button" onClick={() => setQuestionStatus(q.id, "unlearned")}>
          Не выучено
        </button>
        <button className="button" onClick={() => setQuestionStatus(q.id, "learning")}>
          В процессе
        </button>
        <button className="button" onClick={() => setQuestionStatus(q.id, "learned")}>
          Выучено
        </button>
      </div>
    </div>
  );
});
  };

  const renderTraining = () => {
    if (!currentTrainItem) {
      return (
        <div className="card">
          <p className="qTitle">Тренировка завершена 🎉</p>
          <div className="actions">
            <button className="button" onClick={() => setMode("list")}>
              Назад
            </button>
            <button className="button primary" onClick={startTraining} disabled={filteredQuestions.length === 0}>
              Заново
            </button>
          </div>
        </div>
      );
    }

    const st = getStatus(progress, currentTrainItem.id);
    const total = trainOrder.length;
    const idxHuman = trainIndex + 1;

    const next = () => {
      setTrainShowAnswer(false);
      setTrainIndex((i) => Math.min(trainOrder.length - 1, i + 1));
    };

    const prev = () => {
      setTrainShowAnswer(false);
      setTrainIndex((i) => Math.max(0, i - 1));
    };

    const markAndNext = (status: LearnStatus) => {
      setQuestionStatus(currentTrainItem.id, status);
      if (trainIndex < trainOrder.length - 1) {
        setTrainIndex((i) => i + 1);
        setTrainShowAnswer(false);
      }
    };

    return (
      <div className="card">
        <div className="cardTop">
          <div className="cardTopLeft">
            <p className="qTitle">{currentTrainItem.question}</p>
            <div className="muted small">
              {currentTrainItem.topicTitle} • {statusBadge(st)} • {idxHuman}/{total}
            </div>
          </div>

          <button className="button" onClick={() => setTrainShowAnswer((s) => !s)}>
            {trainShowAnswer ? "Скрыть" : "Ответ"}
          </button>
        </div>

        {trainShowAnswer && <div className="answer">{currentTrainItem.answer}</div>}

        <div className="actions">
          <button className="button" onClick={prev} disabled={trainIndex === 0}>
            Назад
          </button>
          <button className="button" onClick={next} disabled={trainIndex >= trainOrder.length - 1}>
            Дальше
          </button>

          <span className="badge">Отметить:</span>
          <button className="button" onClick={() => markAndNext("unlearned")}>
            Не выучено
          </button>
          <button className="button" onClick={() => markAndNext("learning")}>
            В процессе
          </button>
          <button className="button" onClick={() => markAndNext("learned")}>
            Выучено
          </button>

          <button className="button" onClick={() => setMode("list")}>
            Выйти
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      {(topicsOpen || settingsOpen) && <div className="overlay" onClick={closeAll} />}

      {/* Topics drawer */}
      <aside className={`drawer drawerLeft ${topicsOpen ? "open" : ""}`}>
        <div className="drawerHeader">
          <div className="drawerTitle">Темы</div>
          <button className="button" onClick={() => setTopicsOpen(false)}>Закрыть</button>
        </div>

        <div className="card">
          <div className="topicRow">
            <div>
              <div className="muted small">Всего</div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>
                {overall.learned}/{overall.total}
              </div>
            </div>
            <span className="badge">{overall.percent}%</span>
          </div>
          <div className="progressLine">
            <div className="progressFill" style={{ width: `${overall.percent}%` }} />
          </div>
        </div>

        <div
          className={`topicItem ${selectedTopicId === ALL_TOPICS_ID ? "active" : ""}`}
          onClick={() => pickTopic(ALL_TOPICS_ID)}
          role="button"
          tabIndex={0}
        >
          <div className="topicRow">
            <div style={{ fontWeight: 800 }}>Все темы</div>
            <span className="badge">{overall.percent}%</span>
          </div>
          <div className="muted small">{questions.length} вопросов</div>
        </div>

        {topics.map((t) => (
          <div
            key={t.id}
            className={`topicItem ${selectedTopicId === t.id ? "active" : ""}`}
            onClick={() => pickTopic(t.id)}
            role="button"
            tabIndex={0}
          >
            <div className="topicRow">
              <div style={{ fontWeight: 800 }}>{t.title}</div>
              <span className="badge">{t.percentLearned}%</span>
            </div>
            <div className="muted small">
              {t.learned}/{t.total} выучено • {t.learning} в процессе
            </div>
            <div className="progressLine">
              <div className="progressFill" style={{ width: `${t.percentLearned}%` }} />
            </div>
          </div>
        ))}
      </aside>

      {/* Settings drawer */}
      <aside className={`drawer drawerRight ${settingsOpen ? "open" : ""}`}>
        <div className="drawerHeader">
          <div className="drawerTitle">Настройки</div>
          <button className="button" onClick={() => setSettingsOpen(false)}>Закрыть</button>
        </div>

        <div className="card">
          <div className="rowBetween">
            <div className="muted small">Тема</div>
            <button
              className="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="muted small" style={{ marginBottom: 8 }}>Поиск</div>
          <input
            className="input"
            placeholder="Поиск по вопросам (или тегам)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="card">
          <div className="muted small" style={{ marginBottom: 8 }}>Фильтр статуса</div>
          <select
            className="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LearnStatus | "all")}
          >
            <option value="all">Все статусы</option>
            <option value="unlearned">Не выучено</option>
            <option value="learning">В процессе</option>
            <option value="learned">Выучено</option>
          </select>

          <label className="badge" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={trainShuffle}
              onChange={(e) => setTrainShuffle(e.target.checked)}
            />
            Рандом в тренировке
          </label>
        </div>

        <div className="card">
          <div className="actions">
            <button className="button primary" onClick={startTraining} disabled={filteredQuestions.length === 0}>
              Тренировка
            </button>
            <button className="button" onClick={() => setMode("list")}>Список</button>
            <button className="button danger" onClick={onReset}>Сброс прогресса</button>
          </div>
        </div>

        <div className="card">
          <div className="muted small">
            Тема: <b>{selectedTopicTitle}</b>
            <br />
            Видимых: <b>{filteredQuestions.length}</b>
            <br />
            Режим: <b>{mode === "train" ? "тренировка" : "список"}</b>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <div className="topBar">
          <button className="button" onClick={() => { setTopicsOpen(true); setSettingsOpen(false); }}>
            Темы
          </button>

          <div className="topInfo">
            <span className="badge">{selectedTopicTitle}</span>
            <span className="badge">{filteredQuestions.length} шт.</span>
            <span className="badge">{overall.percent}%</span>
          </div>

          <button className="button" onClick={() => { setSettingsOpen(true); setTopicsOpen(false); }}>
            Настройки
          </button>
        </div>

        <div className="content">{mode === "train" ? renderTraining() : renderList()}</div>
      </main>
    </div>
  );
}
