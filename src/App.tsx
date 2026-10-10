import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown,
  Clock3, FileSpreadsheet, Info, Layers3, MapPin, Pause, Play, Plane, Radio, RotateCcw, Search,
  Settings2, SlidersHorizontal, ZoomIn, ZoomOut,
} from 'lucide-react';
import './styles/app.css';
import { readFlightFile, writeFlightFile, type ImportedWorkbook } from './data/workbook';
import { isDepartureFromTsn, toDayString } from './data/enrichFlights';
import { createDclEvents, formatDclMessage, type DclEvent } from './dcl/dclScenario';
import { runSimulation, toScheduledFlights, TAKEOFF_ROLL_MS, type SimulationResult, type TimelineItem } from './simulation/runSimulation';
import { getHoldingPoint, getRunwaySegment, getStandPoint, getTaxiRouteDescription, getTaxiRoutePoints, pointAlongPath } from './map/parkingGeometry';

type FilePickerWindow = Window & { showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]> };
const SAMPLE_FILES = [
  { id: '7d', label: 'Bộ dữ liệu 7 ngày', dates: '01–07.11.2023', filename: 'Số liệu 7 ngày từ  01.11.23  đến 07.11.23.xls', url: '/samples/7-days.xls' },
  { id: '3d', label: 'Bộ dữ liệu 3 ngày', dates: '03–05.11.2023', filename: 'Số liệu 3 ngày từ  03.11.23  đến 05.11.23.xls', url: '/samples/3-days.xls' },
];
const RUNWAYS = [
  { id: '25L-25R', label: '25L / 25R', detail: 'Cấu hình mặc định · hướng Tây Nam' },
];
const speeds = [1, 10, 30, 60];
const fmtTime = (time: number) => new Date(time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtShort = (time: number) => new Date(time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const fmtNumber = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(n);
const seeded = (text: string) => [...text].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

function App() {
  const [imported, setImported] = useState<ImportedWorkbook | null>(null);
  const [flights, setFlights] = useState<TimelineItem[]>([]);
  const [proposed, setProposed] = useState<SimulationResult | null>(null);
  const [events, setEvents] = useState<DclEvent[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState(SAMPLE_FILES[0].id);
  const [runway, setRunway] = useState(RUNWAYS[0].id);
  const [day, setDay] = useState('2023-11-03');
  const [speed, setSpeed] = useState(10);
  const [playing, setPlaying] = useState(false);
  const [minute, setMinute] = useState(300);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('Đang nạp bộ dữ liệu 7 ngày có sẵn…');
  const [busy, setBusy] = useState(false);
  const [writeState, setWriteState] = useState<'clean' | 'dirty' | 'saved'>('clean');
  const [zoom, setZoom] = useState(1);
  const [filter, setFilter] = useState('all');
  const fileInput = useRef<HTMLInputElement>(null);
  const mapScroller = useRef<HTMLDivElement>(null);
  const sampleCache = useRef(new Map<string, ImportedWorkbook>());
  const sampleRequests = useRef(new Map<string, Promise<ImportedWorkbook>>());
  const customWorkbook = useRef<ImportedWorkbook | null>(null);
  const activeLoad = useRef(0);

  function useWorkbook(next: ImportedWorkbook, source: string) {
    const outbound = next.enrichedRows.filter(isDepartureFromTsn);
    const dateCounts = new Map<string, number>();
    for (const row of outbound) {
      const normalized = toDayString(row.FlyDate ?? row.Date);
      dateCounts.set(normalized, (dateCounts.get(normalized) ?? 0) + 1);
    }
    const activeDay = [...dateCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '2023-11-03';
    const dailyRows = outbound.filter((row) => toDayString(row.FlyDate ?? row.Date) === activeDay);
    if (!dailyRows.length) throw new Error('Không tìm thấy chuyến khởi hành từ VVTS trong dữ liệu này.');
    setImported(next); setSelectedSource(source); setDay(activeDay);
    setFlights([]); setProposed(null); setEvents([]); setPlaying(false); setMinute(0);
    setWriteState(next.handle ? 'dirty' : 'clean');
    setMessage(`Đã sẵn sàng ${next.file.name} · ${fmtNumber(next.sourceRows.length)} dòng nguồn · ${fmtNumber(dailyRows.length)} chuyến VVTS ngày ${activeDay}.`);
  }

  function fetchSample(id: string): Promise<ImportedWorkbook> {
    const cached = sampleCache.current.get(id);
    if (cached) return Promise.resolve(cached);
    const inFlight = sampleRequests.current.get(id);
    if (inFlight) return inFlight;
    const sample = SAMPLE_FILES.find((item) => item.id === id);
    if (!sample) return Promise.reject(new Error('Không tìm thấy bộ dữ liệu mẫu.'));
    const request = (async () => {
      const response = await fetch(sample.url);
      if (!response.ok) throw new Error(`Không tải được ${sample.filename} (${response.status}).`);
      const file = new File([await response.blob()], sample.filename, { type: 'application/vnd.ms-excel' });
      const workbook = await readFlightFile(file);
      sampleCache.current.set(id, workbook);
      return workbook;
    })();
    sampleRequests.current.set(id, request);
    void request.finally(() => sampleRequests.current.delete(id)).catch(() => undefined);
    return request;
  }

  async function selectSample(id: string) {
    const requestId = ++activeLoad.current;
    setSelectedSource(id);
    setBusy(true); setMessage('Đang chuẩn bị dữ liệu mẫu…');
    try {
      const next = await fetchSample(id);
      if (requestId === activeLoad.current) useWorkbook(next, id);
    } catch (error) {
      if (requestId === activeLoad.current) setMessage(`Lỗi dữ liệu mẫu: ${(error as Error).message}`);
    } finally {
      if (requestId === activeLoad.current) setBusy(false);
    }
  }

  useEffect(() => {
    void selectSample('7d').then(() => { void fetchSample('3d').catch(() => undefined); });
  }, []);

  async function openWorkbook() {
    setBusy(true); setMessage('Đang mở workbook và chuẩn hóa dữ liệu…');
    try {
      const picker = (window as FilePickerWindow).showOpenFilePicker;
      let file: File; let handle: FileSystemFileHandle | undefined;
      if (picker) {
        const [selected] = await picker.call(window, {
          multiple: false, excludeAcceptAllOption: false,
          types: [{ description: 'Flight data Excel/CSV', accept: { 'application/vnd.ms-excel': ['.xls', '.xlsx', '.csv'], 'text/csv': ['.csv'] } }],
        });
        handle = selected; file = await selected.getFile();
      } else {
        fileInput.current?.click(); setBusy(false); setMessage('Trình duyệt đang mở hộp thoại chọn file.'); return;
      }
      await loadWorkbook(file, handle);
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setMessage(`Không thể mở file: ${(error as Error).message}`);
      setBusy(false);
    }
  }

  async function loadWorkbook(file: File, handle?: FileSystemFileHandle) {
    const requestId = ++activeLoad.current;
    try {
      const next = await readFlightFile(file, handle);
      if (requestId === activeLoad.current) { customWorkbook.current = next; useWorkbook(next, 'custom'); }
    } catch (error) { if (requestId === activeLoad.current) setMessage(`Lỗi dữ liệu: ${(error as Error).message}`); }
    if (requestId === activeLoad.current) setBusy(false);
  }

  const currentSchedule = useMemo(() => imported?.enrichedRows.filter(isDepartureFromTsn) ?? [], [imported]);
  const dailySchedule = useMemo(() => currentSchedule.filter((row) => toDayString(row.FlyDate ?? row.Date) === day), [currentSchedule, day]);
  const holdingPoint = getHoldingPoint(runway);
  const holdingX = holdingPoint.x;
  const runwaySegment = getRunwaySegment(runway);
  const activeRunwayName = runway === '25L-25R' ? 'RWY 25L' : 'RWY 07R';
  const timeCursor = new Date(day + 'T00:00:00').getTime() + minute * 60_000;
  const dayStart = new Date(day + 'T00:00:00').getTime();
  const playbackEndMinute = Math.max(1440, Math.ceil(((flights.at(-1)?.wheelsOff ?? dayStart + 1440 * 60_000) - dayStart) / 600_000) * 10);
  const playbackEndLabel = playbackEndMinute <= 1440
    ? '24:00'
    : `${String(Math.floor((playbackEndMinute - 1440) / 60)).padStart(2, '0')}:${String((playbackEndMinute - 1440) % 60).padStart(2, '0')} +1 ngày`;
  const holdingQueue = flights
    .filter((flight) => timeCursor >= flight.taxiStart + flight.taxiMinutes * 60_000 && timeCursor < flight.runwayEntryStart)
    .sort((a, b) => a.order - b.order);
  function runDay() {
    if (!imported) { setMessage('Hãy chọn workbook trước khi chạy mô phỏng.'); return; }
    setBusy(true);
    window.setTimeout(() => {
      const rows = dailySchedule;
      const schedule = toScheduledFlights(rows);
      const improved = runSimulation(schedule, true);
      setProposed(improved); setFlights(improved.flights);
      if (imported) {
        const resultsByRow = new Map(improved.flights.map((flight) => [flight.row, flight]));
        const updatedRows = imported.enrichedRows.map((row) => {
          const outcome = resultsByRow.get(row);
          return outcome ? { ...row, ActualTakeoff: new Date(outcome.wheelsOff).toISOString(), RunwayEntry: new Date(outcome.runwayEntryStart).toISOString(), TakeoffRollStart: new Date(outcome.takeoffRollStart).toISOString(), ReissuedCTOT: outcome.reissuedCtot ? new Date(outcome.reissuedCtot).toISOString() : '', QueueOrder: outcome.order, RunwayConfig: runway, TaxiRoute: getTaxiRouteDescription(runway, String(row.Stand ?? '—')) } : row;
        });
        setImported({ ...imported, enrichedRows: updatedRows });
      }
      setMinute(0); setPlaying(true);
      const allEvents = improved.flights.flatMap((flight, index) => {
        const clearanceEvents = createDclEvents(flight.callsign, flight.taxiStart, seeded(flight.id) + index, { origin: String(flight.row.AirportDeliveryCode || 'VVTS'), destination: String(flight.row.AirportReceiptCode || 'VVDN'), stand: flight.stand, aircraftType: flight.aircraftType, runway, ctot: flight.ctot });
        if (flight.reissuedCtot === null) return clearanceEvents;
        const updateTime = Math.max(flight.taxiStart + flight.taxiMinutes * 60_000, Math.min(flight.ctot + 10 * 60_000, flight.wheelsOff - 60_000));
        const revisedSlot = new Date(flight.reissuedCtot).toISOString().slice(11, 16).replace(':', '');
        const updateDate = new Date(updateTime).toISOString();
        const updateStamp = `${updateDate.slice(11, 16).replace(':', '')} ${updateDate.slice(8, 10)}${updateDate.slice(5, 7)}${updateDate.slice(2, 4)}`;
        return [...clearanceEvents, { id: `${flight.id}-ctot-update`, time: updateTime, callsign: flight.callsign, direction: 'Hệ thống → Tổ lái', message: `FSM ${updateStamp} VVTS ${flight.callsign} CTOT REVISED ${revisedSlot} AFTER MISSED ORIGINAL SLOT`, status: 'OK' as const }];
      });
      allEvents.sort((a, b) => a.time - b.time);
      setEvents(allEvents); setSelectedFlight(improved.flights[0]?.callsign ?? null);
      setWriteState('dirty'); setMessage(`Mô phỏng hoàn tất · ${fmtNumber(improved.completed)} chuyến · ${runway} · lịch đề xuất sẵn sàng phát lại.`);
      setBusy(false);
    }, 20);
  }

  async function saveWorkbook() {
    if (!imported) return;
    try { await writeFlightFile(imported); setWriteState('saved'); setMessage('Đã ghi các trường mô phỏng vào chính workbook nguồn.'); }
    catch (error) { setMessage((error as Error).message); }
  }

  useEffect(() => {
    if (!playing || !proposed) return;
    const interval = window.setInterval(() => setMinute((previous) => {
      const next = previous + speed / 60;
      if (next >= playbackEndMinute) { setPlaying(false); return playbackEndMinute; }
      return next;
    }), 1000);
    return () => window.clearInterval(interval);
  }, [playing, proposed, speed, playbackEndMinute]);

  const visibleFlights = flights.filter((flight) => {
    const matchesSearch = `${flight.callsign} ${flight.aircraftType} ${flight.stand}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (filter === 'all' || (filter === 'missed' && flight.missedCtot) || (filter === 'moving' && minute * 60_000 >= flight.taxiStart && minute * 60_000 < flight.wheelsOff));
  });
  const activeEvents = events.filter((event) => event.time <= timeCursor).slice(-8).reverse();

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Flight operations home">
          <span className="brand-mark"><Plane size={19} strokeWidth={2.3} /></span>
          <span><strong>FLIGHT OPS</strong><small>TSN · DEPARTURE FLOW</small></span>
        </a>
        <div className="airport-indicator"><span className="live-dot" />TÂN SƠN NHẤT <span className="code-pill">VVTS</span></div>
        <div className="topbar-actions"><span className="demo-tag"><span /> CHẾ ĐỘ MÔ PHỎNG</span><button className="icon-button" aria-label="Cài đặt mô phỏng"><Settings2 size={18} /></button><span className="avatar">OPS</span></div>
      </header>

      <section className="project-hero" id="top" aria-label="Thông tin đồ án">
        <div className="project-hero-copy">
          <div className="project-kicker"><span className="project-kicker-line" /> NHÓM 8</div>
          <h1>ỨNG DỤNG CPDLC- DCL TRONG QUẢN LÝ LUỒNG KHÔNG LƯU TẠI CẢNG HÀNG KHÔNG SÂN BAY TÂN SƠN NHẤT</h1>
          <div className="project-advisor"><span>Giảng viên hướng dẫn:</span> <strong>Nguyễn Ngọc Hoàng Quân</strong></div>
          <div className="project-authors"><strong>Châu Ngọc Xuân <span>2331710004</span></strong><strong>Nguyễn Doãn Phương <span>2331710008</span></strong><strong>Phan Ngọc Trâm <span>2331710044</span></strong><strong>Dương Thị Hương Thảo <span>2331710038</span></strong></div>
        </div>
        <div className="project-hero-meta"><span className="project-class">LỚP <b>23ĐHKL01</b></span></div>
      </section>

      <section className="control-panel" aria-label="Thiết lập mô phỏng">
        <div className="control-source">
          <div className="control-label">NGUỒN DỮ LIỆU <span className="tiny-info" title="Hai bộ mẫu có sẵn; tệp mới được tải riêng">i</span></div>
          <div className="source-picker">
            <label className="select-wrap"><FileSpreadsheet size={16} /><select aria-label="Bộ dữ liệu mẫu" value={selectedSource} onChange={(event) => { if (event.target.value === 'custom' && customWorkbook.current) { ++activeLoad.current; useWorkbook(customWorkbook.current, 'custom'); } else void selectSample(event.target.value); }}>{SAMPLE_FILES.map((sample) => <option value={sample.id} key={sample.id}>{sample.label} · {sample.dates}</option>)}{customWorkbook.current && <option value="custom">Tệp mới: {customWorkbook.current.file.name}</option>}</select><ChevronDown size={15} /></label>
            <button className="button-secondary" onClick={() => void openWorkbook()} disabled={busy}>{busy ? <span className="spinner" /> : <FileSpreadsheet size={16} />} Tải tệp mới</button>
          </div>
          <div className="source-path">{selectedSource === 'custom' ? imported?.file.name : SAMPLE_FILES.find((item) => item.id === selectedSource)?.filename}</div>
          <input ref={fileInput} type="file" accept=".xls,.xlsx,.csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadWorkbook(file); event.currentTarget.value = ''; }} />
        </div>
        <div className="control-divider" />
        <label className="control-field"><span className="control-label">NGÀY KHAI THÁC</span><span className="select-wrap"><CalendarDays size={16} /><input aria-label="Ngày khai thác" type="date" value={day} onChange={(event) => setDay(event.target.value)} /><ChevronDown size={15} /></span></label>
        <label className="control-field runway-field"><span className="control-label">CẤU HÌNH ĐƯỜNG BĂNG</span><span className="select-wrap"><Layers3 size={16} /><select aria-label="Cấu hình đường băng" value={runway} onChange={(event) => setRunway(event.target.value)}>{RUNWAYS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><ChevronDown size={15} /></span><span className="field-hint">{RUNWAYS.find((item) => item.id === runway)?.detail}</span></label>
        <button className="button-primary" onClick={runDay} disabled={!imported || busy}>{busy ? <span className="spinner light" /> : <Play size={16} fill="currentColor" />} Chạy mô phỏng</button>
        <button className={`save-button ${writeState === 'saved' ? 'is-saved' : ''}`} onClick={saveWorkbook} disabled={!imported?.handle || writeState === 'saved'} title={imported?.handle ? 'Ghi trường mô phỏng vào chính workbook đã tải lên' : 'Dữ liệu mẫu tích hợp chỉ đọc; tải tệp mới để ghi trực tiếp'}>{writeState === 'saved' ? <Check size={15} /> : <FileSpreadsheet size={15} />}{writeState === 'saved' ? 'Đã lưu' : 'Ghi vào workbook'}</button>
      </section>
      <div className={`notice ${message.startsWith('Lỗi') || message.startsWith('Không') ? 'notice-error' : ''}`} role="status"><Info size={15} /><span>{message}</span>{imported && <span className="notice-file">{imported.file.name}</span>}</div>

      <section className="playback-bar" aria-label="Điều khiển phát lại">
        <div className="playback-label"><span className={`playback-dot ${playing ? 'active' : ''}`} /><span>{playing ? 'ĐANG PHÁT' : 'PHÁT LẠI 24 GIỜ'}</span></div>
        <button className="play-button" aria-label={playing ? 'Tạm dừng mô phỏng' : 'Phát mô phỏng'} onClick={() => { if (!proposed) runDay(); else setPlaying(!playing); }}><span>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</span>{playing ? 'Tạm dừng' : 'Phát'}</button>
        <div className="timeline-control"><span className="timeline-start">00:00</span><input aria-label="Tua thời gian mô phỏng" type="range" min={0} max={playbackEndMinute} step={1} value={minute} style={{ '--progress': String(minute / playbackEndMinute * 100) + '%' } as React.CSSProperties} onChange={(event) => setMinute(Number(event.target.value))} /><span className="timeline-end">{playbackEndLabel}</span></div>
        <div className="clock-display"><Clock3 size={15} /><strong>{Math.floor(minute / 60 % 24).toString().padStart(2, '0')}:{Math.floor(minute % 60).toString().padStart(2, '0')}</strong><span>LT{minute >= 1440 ? ' +1' : ''}</span></div>
        <span className="playback-divider" />
        <div className="speed-control" aria-label="Tốc độ phát lại">{speeds.map((value) => <button key={value} onClick={() => setSpeed(value)} className={speed === value ? 'active' : ''} aria-pressed={speed === value}>{value}×</button>)}</div>
      </section>

      <div className="workspace-grid">
        <section className="panel map-panel" aria-label="PARKING CHART">
          <div className="panel-heading"><div><div className="panel-kicker">SƠ ĐỒ SÂN ĐỖ · VVTS</div><h2>PARKING CHART <span className="heading-count">{flights.length ? fmtNumber(flights.length) : '—'} chuyến</span></h2></div><div className="map-actions"><button className="icon-button" aria-label="Thu nhỏ bản đồ" onClick={() => setZoom(Math.max(.8, zoom - .15))}><ZoomOut size={16} /></button><span className="zoom-value">{Math.round(zoom * 100)}%</span><button className="icon-button" aria-label="Phóng to bản đồ" onClick={() => setZoom(Math.min(1.5, zoom + .15))}><ZoomIn size={16} /></button><span className="map-action-sep" /><button className="icon-button" aria-label="Đặt lại bản đồ" onClick={() => { setZoom(1); mapScroller.current?.scrollTo({ left: 0, top: 0 }); }}><RotateCcw size={16} /></button></div></div>
          <div className="map-wrap" ref={mapScroller}>
            <div className="map-canvas" style={{ transform: `scale(${zoom})` }}>
              <img src="/assets/parking-chart.jpg" alt="Sơ đồ PARKING CHART sân bay Tân Sơn Nhất" draggable={false} />
              <svg className="map-overlay" viewBox="0 0 1901 1312" role="img" aria-label="Tuyến lăn khởi hành và vị trí tàu bay">
                <defs><filter id="glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                <g className="holding-marker" aria-label={`Điểm chờ trước đường băng ${activeRunwayName}`}><circle cx={holdingPoint.x} cy={holdingPoint.y} r="10"/><text x={holdingPoint.x - 35} y={holdingPoint.y - 15}>{runway === '25L-25R' ? 'S1 · RWY 25L' : 'S8 · RWY 07R'}</text></g>
                <g className="runway-end"><circle cx={runwaySegment.threshold.x} cy={runwaySegment.threshold.y} r="6"/><text x={runwaySegment.threshold.x - (runway === '25L-25R' ? 82 : 50)} y="418">{runway === '25L-25R' ? 'TAKEOFF · ' : 'INT TKOF · '}{activeRunwayName}</text></g>
                {flights.filter((flight) => timeCursor >= flight.readyAt - 45 * 60_000 && timeCursor < flight.wheelsOff).slice(0, 180).map((flight) => {
                  const standPoint = getStandPoint(flight.stand);
                  const taxiRoute = getTaxiRoutePoints(flight.stand, runway);
                  const finished = timeCursor >= flight.wheelsOff;
                  const taxiComplete = flight.taxiStart + flight.taxiMinutes * 60_000;
                  const queueIndex = holdingQueue.findIndex((queued) => queued.id === flight.id);
                  const isTaxiing = timeCursor >= flight.taxiStart && timeCursor < taxiComplete;
                  const isOnRunway = timeCursor >= flight.runwayEntryStart && timeCursor < flight.wheelsOff;
                  const isTakingOff = timeCursor >= flight.takeoffRollStart && timeCursor < flight.wheelsOff;
                  const position = isOnRunway
                    ? isTakingOff
                      ? pointAlongPath([runwaySegment.threshold, runwaySegment.rollEnd], (timeCursor - flight.takeoffRollStart) / TAKEOFF_ROLL_MS)
                      : pointAlongPath(runwaySegment.entryPath, (timeCursor - flight.runwayEntryStart) / (flight.takeoffRollStart - flight.runwayEntryStart))
                    : isTaxiing
                        ? pointAlongPath(taxiRoute, (timeCursor - flight.taxiStart) / Math.max(1, flight.taxiMinutes * 60_000))
                        : timeCursor >= taxiComplete
                          ? queueIndex === 0
                            ? holdingPoint
                            : runway === '25L-25R'
                              ? { x: holdingX - (queueIndex - 1) * 24, y: holdingPoint.y }
                              : { x: holdingX, y: holdingPoint.y + (queueIndex - 1) * 24 }
                          : standPoint;
                  const chosen = selectedFlight === flight.callsign;
                  if (finished) return null;
                  const missedByNow = flight.missedCtot && timeCursor > flight.ctot + 10 * 60_000;
                  const rotation = isTakingOff ? (runway === '25L-25R' ? -90 : 90) : 0;
                  const phase = isTakingOff ? 'đang chạy đà cất cánh' : isOnRunway ? 'đang vào đường băng' : isTaxiing ? 'đang lăn' : timeCursor >= taxiComplete ? 'đang chờ tại điểm chờ runway' : `đang ở stand ${flight.stand}`;
                  return <g key={flight.id} className={`aircraft-marker ${chosen ? 'selected' : ''} ${missedByNow ? 'delayed' : ''} ${isOnRunway ? 'taking-off' : ''}`} transform={`translate(${position.x} ${position.y}) rotate(${rotation})`} onClick={() => setSelectedFlight(flight.callsign)} role="button" aria-label={`${flight.callsign}, stand ${flight.stand}, ${phase}, ${missedByNow ? 'đã lỡ CTOT ban đầu' : 'chưa lỡ CTOT'}`} tabIndex={0}>
                    <title>{`${flight.callsign} · ${missedByNow ? 'đã lỡ CTOT ban đầu (−5 / +10 phút)' : 'chưa lỡ CTOT'}`}</title>
                    {chosen && <circle className="marker-pulse" r="16" />}
                    <circle className="marker-halo" r="10"/><path d="M0-9 2-1 7 2 7 4 2 3 2 8 0 9-2 8-2 3-7 4-7 2-2-1Z"/><circle className="marker-core" r="2.5"/>
                    {chosen && <g className="marker-label"><rect x="12" y="-16" width="88" height="23" rx="5"/><text x="20" y="0">{flight.callsign}</text></g>}
                  </g>;
                })}
              </svg>
            </div>
          </div>
          <div className="map-legend"><span><i className="legend-dot aircraft" />Tàu bay tại thời điểm phát lại</span><span><i className="legend-dot delayed-aircraft" />Đã lỡ CTOT ban đầu</span><span><i className="legend-ring" />Điểm chờ trước đường băng</span></div>
        </section>

        <section className="panel dcl-panel" aria-label="Bản tin DCL">
          <div className="panel-heading"><div><h2>Bản tin DCL</h2></div><span className="dcl-protocol"><Radio size={14} /> MÔ PHỎNG</span></div>
          <div className="dcl-body">
            <table className="dcl-board" aria-label="Bảng điện văn DCL">
              <thead><tr><th>GIỜ LT</th><th>LUỒNG</th><th>ĐIỆN VĂN</th><th>KẾT QUẢ</th></tr></thead>
              <tbody>
                {activeEvents.length ? activeEvents.map((event) => {
                  const messageFlow = event.direction === 'Tổ lái → Hệ thống' ? 'ACFT → ATC' : 'ATC → ACFT';
                  const resultClass = event.status === 'OK' ? 'ok' : event.status === 'TỪ CHỐI' ? 'rejected' : 'timeout';
                  return <tr key={event.id} className="dcl-board-row" onClick={() => setSelectedFlight(event.callsign)}>
                    <td className="dcl-board-time">{fmtTime(event.time)}</td>
                    <td><span className="dcl-flow">{messageFlow}</span></td>
                    <td><code className="dcl-raw-message">{formatDclMessage(event.message).map((line, lineIndex) => <span className="dcl-message-line" key={`${event.id}-${lineIndex}`}>{line}</span>)}</code></td>
                    <td><span className={`dcl-result dcl-result-${resultClass}`}><i />{event.status}</span></td>
                  </tr>;
                }) : <tr><td colSpan={4} className="dcl-empty-cell"><Radio size={16} />Bản tin sẽ xuất hiện đồng bộ theo thời gian mô phỏng.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="dcl-footer"><span><span className="live-dot" />{fmtNumber(activeEvents.length)} / {fmtNumber(events.length)} bản tin trong ngày</span><span>RCD <i>→</i> FSM <i>→</i> CLD <i>→</i> CDA</span></div>
        </section>
      </div>

      <section className="kpi-grid" aria-label="Chỉ số mô phỏng">
        <article className="kpi-card"><div className="kpi-top"><span>TỔNG CHUYẾN</span><span className="kpi-icon blue"><Plane size={17} /></span></div><div className="kpi-value">{fmtNumber(proposed?.completed ?? dailySchedule.length)}</div><div className="kpi-foot"><span className="kpi-neutral">{imported ? 'VVTS · ngày đang chọn' : 'Chưa nạp dữ liệu'}</span></div></article>
        <article className="kpi-card"><div className="kpi-top"><span>TỔNG THỜI GIAN CHỜ</span><span className="kpi-icon amber"><Clock3 size={17} /></span></div><div className="kpi-value">{fmtNumber(proposed?.totalWaitMinutes ?? 0)}<small> phút</small></div><div className="kpi-foot"><span className="kpi-neutral">Không tính thời gian lăn</span></div></article>
        <article className="kpi-card"><div className="kpi-top"><span>LỠ SLOT / CẤP LẠI CTOT</span><span className="kpi-icon red"><AlertTriangle size={17} /></span></div><div className="kpi-value">{fmtNumber(proposed?.missedCtot ?? 0)}</div><div className="kpi-foot"><span className="kpi-neutral">Cửa sổ −5 / +10 phút <span className="dot-separator">·</span> {fmtNumber(proposed?.reissuedCtot ?? 0)} cấp lại</span></div></article>
      </section>

      <div className="queue-grid">
        <section className="panel queue-panel" aria-label="Hàng chờ cất cánh">
          <div className="panel-heading queue-heading"><div><div className="panel-kicker">ĐIỀU PHỐI REAL-TIME</div><h2>Hàng chờ cất cánh</h2></div><span className={`queue-live ${playing ? 'on' : ''}`}><span />{playing ? 'LIVE' : 'ĐANG CHỜ'}</span></div>
          <div className="queue-toolbar"><div className="search-box"><Search size={15} /><input aria-label="Tìm chuyến bay" placeholder="Tìm callsign, stand…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select aria-label="Lọc hàng chờ" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Tất cả chuyến</option><option value="moving">Đang lăn</option><option value="missed">Lỡ CTOT</option></select><button className="icon-button filter-icon" aria-label="Bộ lọc nâng cao"><SlidersHorizontal size={15} /></button></div>
          <div className="table-scroll"><table><thead><tr><th>#</th><th>CALLSIGN / LOẠI TÀU BAY</th><th>STAND</th><th>CTOT</th><th>TRẠNG THÁI</th></tr></thead><tbody>
            {visibleFlights.slice(0, 90).map((flight) => <tr key={flight.id} className={selectedFlight === flight.callsign ? 'selected-row' : ''} onClick={() => setSelectedFlight(flight.callsign)}>
              <td className="order-cell">{flight.order.toString().padStart(2, '0')}</td><td><div className="flight-call">{flight.callsign}</div><div className="flight-type">{flight.aircraftType}</div></td><td><span className="stand-pill">{flight.stand}</span></td><td className="time-cell" title={flight.reissuedCtot ? `CTOT ban đầu ${fmtShort(flight.ctot)}` : undefined}>{fmtShort(flight.reissuedCtot ?? flight.ctot)}</td><td><span className={`status-pill ${flight.reissuedCtot ? 'status-wait' : flight.waitMinutes > 0.1 ? 'status-wait' : 'status-ok'}`}><i />{flight.reissuedCtot ? 'CTOT cấp lại' : flight.waitMinutes > .1 ? 'Chờ slot' : 'Đúng CTOT'}</span></td>
            </tr>)}
            {!visibleFlights.length && <tr><td colSpan={5} className="empty-row">{flights.length ? 'Không có chuyến phù hợp bộ lọc.' : 'Nạp dữ liệu và chạy mô phỏng để hiển thị hàng chờ.'}</td></tr>}
          </tbody></table></div>
          <div className="queue-footer"><span>Hiển thị <b>{fmtNumber(Math.min(visibleFlights.length, 90))}</b> / {fmtNumber(visibleFlights.length)} chuyến</span><button onClick={() => setFilter('all')}>Xem toàn bộ <ArrowRight size={14} /></button></div>
        </section>
      </div>
    </main>
  );
}

export default App;




