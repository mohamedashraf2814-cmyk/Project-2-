import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Activity, BookOpen, Bot, Boxes, CircuitBoard, FlaskConical, HeartPulse, Menu, Pill, ScrollText, Settings, Watch } from 'lucide-react';
import { useApp, useSlow } from './store/hooks';
import { sim } from './simulation/instance';

import LabPage from './pages/LabPage';
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const WiringPage = lazy(() => import('./pages/WiringPage'));
const RobotSimPage = lazy(() => import('./pages/RobotSimPage'));
const WearablePage = lazy(() => import('./pages/WearablePage'));
const MedicationPage = lazy(() => import('./pages/MedicationPage'));
const CareTwinPage = lazy(() => import('./pages/CareTwinPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const PAGES = [
  { id: 'lab', title: 'مختبر التركيب', icon: FlaskConical },
  { id: 'library', title: 'مكتبة المكونات', icon: Boxes },
  { id: 'wiring', title: 'توصيلات الدائرة', icon: CircuitBoard },
  { id: 'robot', title: 'محاكاة حركة الروبوت', icon: Bot },
  { id: 'wearable', title: 'السوار الذكي', icon: Watch },
  { id: 'medication', title: 'تذكير الأدوية', icon: Pill },
  { id: 'caretwin', title: 'Care Twin', icon: HeartPulse },
  { id: 'events', title: 'سجل الأحداث', icon: ScrollText },
  { id: 'settings', title: 'إعدادات المشروع', icon: Settings },
] as const;
type PageId = (typeof PAGES)[number]['id'];

const fromHash = (): PageId => {
  const h = location.hash.replace('#/', '').replace('#', '');
  return (PAGES.find((p) => p.id === h)?.id ?? 'lab') as PageId;
};

export default function App() {
  const [page, setPage] = useState<PageId>(fromHash);
  const [open, setOpen] = useState(false);
  const data = useApp();
  const slow = useSlow();

  useEffect(() => {
    const on = () => setPage(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = data.prefs.theme;
  }, [data.prefs.theme]);
  useEffect(() => {
    const t = PAGES.find((p) => p.id === page)!.title;
    document.title = `${t} — SOFT STREAM NEXUS CARE AI`;
  }, [page]);
  useEffect(() => () => sim.dispose(), []);

  const go = useCallback((p: string) => {
    location.hash = `/${p}`;
    setOpen(false);
    window.scrollTo(0, 0);
  }, []);
  const cur = PAGES.find((p) => p.id === page)!;
  const status = slow.status === 'running' ? 'المحاكاة تعمل' : slow.status === 'paused' ? 'المحاكاة متوقفة مؤقتًا' : 'المحاكاة متوقفة';

  return (
    <div className="shell">
      <a className="sr" href="#main">تخطَّ إلى المحتوى</a>
      {open ? <div className="scrim" onClick={() => setOpen(false)} /> : null}
      <aside className={`side ${open ? 'open' : ''}`} aria-label="التنقل الرئيسي">
        <div className="brand">
          <div className="brand-mark"><Activity size={20} /></div>
          <div><b>SOFT STREAM<br />NEXUS CARE AI</b><span>مختبر الروبوت الذكي</span></div>
        </div>
        <nav className="stack" style={{ gap: 4 }}>
          {PAGES.map((p) => (
            <button key={p.id} className="nav-btn" aria-current={p.id === page ? 'page' : undefined} onClick={() => go(p.id)}>
              <p.icon size={18} /> {p.title}
            </button>
          ))}
        </nav>
        <div className="side-foot">كل البيانات في هذا المشروع <b>محاكاة</b> وليست من عتاد حقيقي.</div>
      </aside>
      <div className="main">
        <header className="top">
          <button className="btn icon menu-btn" aria-label="فتح القائمة" onClick={() => setOpen(true)}><Menu size={18} /></button>
          <h1>{cur.title}</h1>
          <span className="grow" />
          <span className="sim-banner" role="status"><BookOpen size={14} /> وضع المحاكاة — {status}</span>
        </header>
        <main className="content" id="main" tabIndex={-1}>
          <Suspense fallback={<div className="empty">جارٍ التحميل…</div>}>
            {page === 'lab' && <LabPage go={go} />}
            {page === 'library' && <LibraryPage />}
            {page === 'wiring' && <WiringPage />}
            {page === 'robot' && <RobotSimPage />}
            {page === 'wearable' && <WearablePage />}
            {page === 'medication' && <MedicationPage />}
            {page === 'caretwin' && <CareTwinPage />}
            {page === 'events' && <EventsPage />}
            {page === 'settings' && <SettingsPage />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
