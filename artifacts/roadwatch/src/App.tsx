import { type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  getGetReportQueryKey,
  getGetReportStatisticsQueryKey,
  getListReportsQueryKey,
  useCreateReport,
  useGetReport,
  useGetReportStatistics,
  useListReports,
  useUploadReportPhoto,
} from '@workspace/api-client-react';
import type { RoadReport, RoadReportInput, RoadReportStatus, ReportStatistics } from '@workspace/api-client-react';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Camera, Check, ChevronDown,
  CircleAlert, Clock3, FilePlus2, Filter, LocateFixed, MapPin, Menu, Search, ShieldCheck, Signal,
  Siren, X,
} from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const stages: RoadReportStatus[] = ['received', 'reviewing', 'scheduled', 'resolved'];
const statusNames: Record<RoadReportStatus, string> = {
  received: 'Received', reviewing: 'Under review', scheduled: 'Work scheduled', resolved: 'Resolved',
};
const statusCopy: Record<RoadReportStatus, string> = {
  received: 'Your report is in the city’s queue.',
  reviewing: 'A city team is assessing this location.',
  scheduled: 'Repair work has been scheduled.',
  resolved: 'This road issue has been marked resolved.',
};
const severityNames = { low: 'Low impact', medium: 'Moderate', high: 'High risk' };

function BrandMark({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark ${small ? 'brand-mark-small' : ''}`} aria-hidden="true"><span /><span /><span /></span>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="app-shell min-h-[100dvh]">
      <aside className={`rail ${menuOpen ? 'rail-open' : ''}`}>
        <Link href="/" className="brand-lockup" data-testid="link-roadwatch-home" onClick={() => setMenuOpen(false)}>
          <BrandMark /><span className="brand-word">roadwatch<span>.</span></span>
        </Link>
        <div className="rail-intro">
          <span className="eyebrow">THE CITY, IN VIEW</span>
          <p>Small reports.<br />Safer streets.</p>
        </div>
        <nav className="rail-nav" aria-label="Main navigation">
          <Link href="/" className={`rail-link ${location === '/' ? 'rail-link-active' : ''}`} data-testid="link-dashboard" onClick={() => setMenuOpen(false)}>
            <Signal size={17} strokeWidth={1.8} /> <span>Street pulse</span><span className="nav-index">01</span>
          </Link>
          <Link href="/report" className={`rail-link ${location === '/report' ? 'rail-link-active' : ''}`} data-testid="link-report" onClick={() => setMenuOpen(false)}>
            <FilePlus2 size={17} strokeWidth={1.8} /> <span>Make a report</span><span className="nav-index">02</span>
          </Link>
        </nav>
        <div className="rail-bottom">
          <div className="rail-promise"><ShieldCheck size={18} /><p>Every report has a trail.<br /><strong>Follow it through.</strong></p></div>
          <span className="rail-caption">A clearer route to safer roads.</span>
        </div>
      </aside>
      {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <main className="main-panel">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" data-testid="button-menu" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
          <div className="breadcrumb"><span>ROADWATCH</span><span className="breadcrumb-slash">/</span><span>{location === '/' ? 'STREET PULSE' : location === '/report' ? 'NEW REPORT' : 'REPORT TRACKING'}</span></div>
          <Link href="/report" className="top-report" data-testid="link-report-top"><span>Report a road issue</span><ArrowUpRight size={15} /></Link>
        </header>
        <div className="page-content">{children}</div>
        <footer className="site-footer"><span>ROADWATCH <b>•</b> MAKE THE STREET VISIBLE</span><span>Built for the block you call home.</span></footer>
      </main>
    </div>
  );
}

function PageFrame() {
  return <Shell><RoutedErrorBoundary><Switch>
    <Route path="/" component={Dashboard} />
    <Route path="/report" component={ReportFormPage} />
    <Route path="/reports/:id" component={ReportDetail} />
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary></Shell>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function MetricTile({ label, value, icon: Icon, detail, tone }: { label: string; value?: number; icon: typeof Signal; detail: string; tone?: string }) {
  return <div className={`metric-tile ${tone || ''}`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="metric-top"><span>{label}</span><Icon size={17} strokeWidth={1.7} /></div>
    {value === undefined ? <div className="skeleton metric-skeleton" /> : <strong className="metric-number">{value.toLocaleString()}</strong>}
    <span className="metric-detail">{detail}</span>
  </div>;
}

function StatusPill({ status }: { status: RoadReportStatus }) {
  return <span className={`status-pill status-${status}`} data-testid={`status-${status}`}><i />{statusNames[status]}</span>;
}

function SeverityMark({ severity }: { severity: RoadReport['severity'] }) {
  return <span className={`severity-tag severity-${severity}`}><span />{severityNames[severity]}</span>;
}

function ReportRow({ report }: { report: RoadReport }) {
  return <Link href={`/reports/${report.id}`} className="report-row" data-testid={`card-report-${report.id}`}>
    <span className="row-priority"><span className={`priority-bar priority-${report.severity}`} /></span>
    <span className="row-main">
      <span className="row-title" data-testid={`text-report-title-${report.id}`}>{report.title}</span>
      <span className="row-address"><MapPin size={13} />{report.address}</span>
    </span>
    <span className="row-status"><StatusPill status={report.status} /></span>
    <span className="row-date">{new Date(report.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
    <ArrowRight className="row-arrow" size={17} />
  </Link>;
}

function ReportLoadingList() {
  return <div className="report-loading" aria-label="Loading reports">{[0, 1, 2, 3].map((i) => <div className="skeleton-row" key={i}><i /><span><b /><b /></span><b /></div>)}</div>;
}

function Dashboard() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const params = useMemo(() => ({ search: search.trim() || undefined, status: status ? status as RoadReportStatus : undefined }), [search, status]);
  const list = useListReports(params);
  const stats = useGetReportStatistics();
  const reports = list.data || [];
  const stat = stats.data as ReportStatistics | undefined;
  return <div className="dashboard-page">
    <section className="dashboard-hero animate-rise">
      <div className="hero-copy">
        <div className="section-kicker"><span className="live-dot" /> COMMUNITY ROADWATCH <span className="kicker-rule" /></div>
        <h1>Safer streets<br />start <em>right here.</em></h1>
        <p>See what neighbors are reporting. Follow what the city is fixing. Make the streets you share a little safer.</p>
        <div className="hero-actions">
          <Link href="/report" className="button-primary" data-testid="button-report-hero"><span>Report a road issue</span><ArrowUpRight size={17} /></Link>
          <a className="text-link" href="#recent-reports">Explore reports <ArrowDownRight size={15} /></a>
        </div>
      </div>
      <div className="hero-visual" aria-label="Neighborhood street illustration">
        <div className="map-grid" />
        <svg className="street-art" viewBox="0 0 460 310" role="img" aria-label="Illustration of streets and community reporting markers">
          <path d="M-15 225 C80 155 119 185 184 129 C250 73 276 74 485 16" className="road-edge" />
          <path d="M-15 225 C80 155 119 185 184 129 C250 73 276 74 485 16" className="road-center" />
          <path d="M220 330 C231 249 226 204 184 129 C147 61 161 36 204 -15" className="road-edge road-cross" />
          <path d="M220 330 C231 249 226 204 184 129 C147 61 161 36 204 -15" className="road-center road-cross" />
          <path d="M-10 84 C57 113 113 116 184 129" className="minor-road" />
          <path d="M270 87 C326 142 376 180 480 195" className="minor-road" />
          <g className="block-shapes"><rect x="33" y="25" width="74" height="38" rx="5"/><rect x="275" y="37" width="94" height="42" rx="5"/><rect x="294" y="224" width="102" height="45" rx="5"/><rect x="43" y="252" width="96" height="37" rx="5"/><rect x="308" y="113" width="58" height="35" rx="5"/><rect x="54" y="108" width="53" height="29" rx="5"/></g>
          <g className="tree-dots"><circle cx="23" cy="163" r="6"/><circle cx="116" cy="74" r="5"/><circle cx="263" cy="25" r="6"/><circle cx="400" cy="68" r="7"/><circle cx="425" cy="257" r="5"/><circle cx="180" cy="272" r="7"/><circle cx="130" cy="220" r="5"/></g>
          <g className="pin pin-a"><circle cx="0" cy="0" r="19"/><path d="M0-6a6 6 0 1 0 0 12 6 6 0 0 0 0-12m0 19-9-11h18z"/></g>
          <g className="pin pin-b"><circle cx="0" cy="0" r="15"/><path d="M0-5a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0 15-7-9h14z"/></g>
          <g className="pin pin-c"><circle cx="0" cy="0" r="14"/><path d="M0-5a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0 15-7-9h14z"/></g>
        </svg>
        <div className="map-stamp"><span>YOUR<br />BLOCK</span><span className="stamp-ring">RW</span></div>
        <div className="map-caption"><span className="live-dot" /> LIVE NEIGHBORHOOD SIGNAL</div>
      </div>
    </section>
    <section className="metrics-strip animate-rise delay-1" aria-label="Report statistics" data-testid="report-statistics">
      <MetricTile label="Reports made" value={stat?.total} icon={Signal} detail="Visible across the city" />
      <MetricTile label="Being reviewed" value={stat?.reviewing} icon={Clock3} detail="On a city team's radar" />
      <MetricTile label="Work scheduled" value={stat?.scheduled} icon={ArrowUpRight} detail="Repairs in the pipeline" />
      <MetricTile label="Fixed streets" value={stat?.resolved} icon={BadgeCheck} detail={stat ? `${stat.updatedToday} updated today` : 'Updated today'} tone="metric-highlight" />
    </section>
    {stats.isError && <div className="stats-error" role="alert" data-testid="error-statistics"><CircleAlert size={14} /><span>Street totals are temporarily unavailable.</span><button onClick={() => stats.refetch()} data-testid="button-retry-statistics">Retry</button></div>}
    <section className="reports-section animate-rise delay-2" id="recent-reports">
      <div className="section-heading">
        <div><div className="section-kicker">THE SHARED STREET LOG</div><h2>Reports from around you<span>.</span></h2><p>Every report is a small step toward a street that works for everyone.</p></div>
        <Link href="/report" className="button-outline" data-testid="button-report-list"><FilePlus2 size={16} /> Add a report</Link>
      </div>
      <div className="report-toolbar">
        <label className="search-wrap"><Search size={17} /><input aria-label="Search reports" data-testid="input-search-reports" type="search" placeholder="Search streets or road issues" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <label className="filter-wrap"><Filter size={15} /><select aria-label="Filter by status" data-testid="select-report-status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{stages.map((s) => <option key={s} value={s}>{statusNames[s]}</option>)}</select><ChevronDown size={14} /></label>
      </div>
      <div className="report-list" data-testid="report-list">
        <div className="list-head"><span>ISSUE / LOCATION</span><span>STATUS</span><span>REPORTED</span><span /></div>
        {list.isLoading ? <ReportLoadingList /> : list.isError ? <ErrorState message="Reports could not load right now." onRetry={() => list.refetch()} /> : reports.length === 0
          ? <EmptyReports searching={Boolean(search || status)} />
          : reports.map((report) => <ReportRow key={report.id} report={report} />)}
      </div>
      <div className="list-foot"><span>{list.isLoading ? 'Connecting to the street log…' : `${reports.length} ${reports.length === 1 ? 'report' : 'reports'} shown`}</span><span>Updated as reports move forward <span className="foot-spark">↗</span></span></div>
    </section>
    <section className="closing-callout"><div className="callout-icon"><Siren size={22} /></div><div><span className="section-kicker">YOU KNOW YOUR STREET</span><h2>Make the next fix visible.</h2><p>A clear report gives city crews a place to start.</p></div><Link href="/report" className="button-callout" data-testid="button-report-callout">Report an issue <ArrowRight size={16} /></Link></section>
  </div>;
}

function EmptyReports({ searching }: { searching: boolean }) {
  return <div className="empty-state" data-testid="empty-reports"><div className="empty-symbol"><Search size={21} /></div><h3>{searching ? 'No matching reports yet.' : 'The log is quiet for now.'}</h3><p>{searching ? 'Try another street name or clear the status filter.' : 'Be the first neighbor to make a road issue visible.'}</p>{!searching && <Link href="/report" className="text-link">Make the first report <ArrowRight size={15} /></Link>}</div>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error-state" role="alert" data-testid="error-reports"><CircleAlert size={19} /><div><strong>Connection interrupted</strong><p>{message}</p></div><Button variant="outline" onClick={onRetry} data-testid="button-retry">Try again</Button></div>;
}

const reportSchema = z.object({
  title: z.string().min(4, 'Give this issue a short, clear title.').max(100),
  description: z.string().min(10, 'Add a little more detail (at least 10 characters).').max(1200),
  address: z.string().min(4, 'Enter a street address.').max(240),
  latitude: z.coerce.number({ invalid_type_error: 'Enter a valid latitude.' }).min(-90).max(90),
  longitude: z.coerce.number({ invalid_type_error: 'Enter a valid longitude.' }).min(-180).max(180),
  severity: z.enum(['low', 'medium', 'high']),
  reporterName: z.string().max(80).optional(),
});
type ReportValues = z.infer<typeof reportSchema>;

function ReportFormPage() {
  const [, setLocation] = useLocation();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [geoMessage, setGeoMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [created, setCreated] = useState<RoadReport | null>(null);
  const upload = useUploadReportPhoto();
  const create = useCreateReport();
  const queryClient = useQueryClient();
  const form = useForm<z.input<typeof reportSchema>, unknown, ReportValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: { title: '', description: '', address: '', latitude: undefined, longitude: undefined, severity: 'medium', reporterName: '' },
  });
  const locating = () => {
    setGeoMessage('');
    if (!navigator.geolocation) { setGeoMessage('Location is not available in this browser. Enter coordinates below.'); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      form.setValue('latitude', Number(position.coords.latitude.toFixed(6)), { shouldValidate: true });
      form.setValue('longitude', Number(position.coords.longitude.toFixed(6)), { shouldValidate: true });
      setGeoMessage('Location added. Please check that it points to the right spot.');
    }, () => setGeoMessage('Could not access your location. You can enter coordinates manually.'), { enableHighAccuracy: true, timeout: 8000 });
  };
  const onSubmit = async (values: ReportValues) => {
    setSubmitError('');
    try {
      let photoId: string | undefined;
      if (photoFile) {
        const data = await fileToBase64(photoFile);
        const photo = await upload.mutateAsync({ data: { fileName: photoFile.name, contentType: photoFile.type as 'image/jpeg' | 'image/png' | 'image/webp', data } });
        photoId = photo.id;
      }
      const payload: RoadReportInput = { ...values, latitude: Number(values.latitude), longitude: Number(values.longitude), reporterName: values.reporterName?.trim() || undefined, photoId };
      const report = await create.mutateAsync({ data: payload });
      setCreated(report);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListReportsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetReportStatisticsQueryKey() }),
      ]);
    } catch {
      setSubmitError(photoFile && upload.isError ? 'Your photo could not be uploaded. Please try again or submit without a photo.' : 'Your report could not be sent. Please try again.');
    }
  };
  if (created) return <div className="confirmation-page animate-rise" data-testid="report-success">
    <div className="confirm-mark"><Check size={28} /></div><span className="section-kicker">REPORT RECEIVED</span>
    <h1>Thank you for<br /><em>speaking up.</em></h1><p>Your report is now part of the shared street log. Keep this code to follow its progress.</p>
    <div className="tracking-ticket"><span>YOUR TRACKING CODE</span><strong data-testid="text-tracking-code">{created.trackingCode}</strong><small>Save this code somewhere handy.</small></div>
    <div className="confirmation-actions"><Link href={`/reports/${created.id}`} className="button-primary" data-testid="link-track-report">Track this report <ArrowRight size={16} /></Link><button className="text-link button-as-link" onClick={() => { setCreated(null); form.reset(); setPhotoFile(null); setLocation('/'); }} data-testid="button-back-dashboard">Back to street pulse <ArrowLeft size={15} /></button></div>
  </div>;
  return <div className="report-page animate-rise">
    <div className="form-intro"><Link href="/" className="back-link" data-testid="link-back-dashboard"><ArrowLeft size={15} /> Street pulse</Link><div className="section-kicker"><span className="kicker-rule" /> SEND A SIGNAL</div><h1>Something on the<br />road needs <em>attention.</em></h1><p>Tell us what you see. A useful report helps city teams understand where to look.</p></div>
    <div className="report-layout">
      <div className="form-card">
        <div className="form-card-heading"><div><span className="form-step">01 / DETAILS</span><h2>What’s happening?</h2></div><span className="required-note">* Required</span></div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="report-form" noValidate>
            <FormField control={form.control} name="title" render={({ field }) => <FormItem><FormLabel>Issue title <span>*</span></FormLabel><FormControl><Input placeholder="e.g. Deep pothole near the crossing" {...field} data-testid="input-report-title" /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="description" render={({ field }) => <FormItem><FormLabel>What did you notice? <span>*</span></FormLabel><FormControl><Textarea placeholder="Describe the damage, its size, and anything that helps crews find it." rows={4} maxLength={1200} {...field} data-testid="input-report-description" /></FormControl><div className="field-hint">{field.value?.length || 0} / 1200 characters<FormMessage /></div></FormItem>} />
            <FormField control={form.control} name="address" render={({ field }) => <FormItem><FormLabel>Street address or nearest intersection <span>*</span></FormLabel><FormControl><Input placeholder="Street, cross street, or nearby landmark" {...field} data-testid="input-report-address" /></FormControl><FormMessage /></FormItem>} />
            <div className="coord-heading"><div><span className="form-step">PIN THE LOCATION</span><span className="coord-explainer">Coordinates help crews locate the exact spot.</span></div><button type="button" className="locate-button" onClick={locating} data-testid="button-use-location"><LocateFixed size={14} /> Use my location</button></div>
            <div className="coordinate-grid">
              <FormField control={form.control} name="latitude" render={({ field }) => <FormItem><FormLabel>Latitude <span>*</span></FormLabel><FormControl><Input type="number" step="any" placeholder="37.7749" {...field} value={field.value ?? ''} data-testid="input-report-latitude" /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="longitude" render={({ field }) => <FormItem><FormLabel>Longitude <span>*</span></FormLabel><FormControl><Input type="number" step="any" placeholder="-122.4194" {...field} value={field.value ?? ''} data-testid="input-report-longitude" /></FormControl><FormMessage /></FormItem>} />
            </div>
            {geoMessage && <p className="inline-feedback" role="status">{geoMessage}</p>}
            <FormField control={form.control} name="severity" render={({ field }) => <FormItem><FormLabel>How risky does it feel? <span>*</span></FormLabel><div className="severity-options" role="radiogroup" aria-label="Issue severity">{(['low', 'medium', 'high'] as const).map((option) => <button type="button" key={option} role="radio" aria-checked={field.value === option} className={`severity-option ${field.value === option ? 'severity-selected' : ''}`} onClick={() => field.onChange(option)} data-testid={`button-severity-${option}`}><i className={`severity-dot severity-dot-${option}`} /><span>{severityNames[option]}</span>{field.value === option && <Check size={14} />}</button>)}</div><FormMessage /></FormItem>} />
            <div className="upload-field"><label htmlFor="report-photo" className="upload-label">Add a photo <span className="optional-label">OPTIONAL</span></label><label htmlFor="report-photo" className={`upload-box ${photoFile ? 'upload-has-file' : ''}`} data-testid="dropzone-report-photo"><input id="report-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { setPhotoError(''); const file = e.target.files?.[0]; if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setPhotoError('Choose a JPG, PNG or WebP image.'); return; } if (file.size > 3 * 1024 * 1024) { setPhotoError('Choose a photo smaller than 3 MB.'); return; } setPhotoFile(file); }} data-testid="input-report-photo" /><span className="upload-icon"><Camera size={19} /></span><span className="upload-copy"><strong>{photoFile ? photoFile.name : 'Choose a photo of the issue'}</strong><small>{photoFile ? 'Photo ready to attach' : 'JPG, PNG or WebP · Up to 3 MB'}</small></span>{photoFile && <button type="button" className="remove-photo" aria-label="Remove photo" onClick={(e) => { e.preventDefault(); setPhotoFile(null); }} data-testid="button-remove-photo"><X size={15} /></button>}</label>{photoError && <p className="field-error">{photoError}</p>}</div>
            <FormField control={form.control} name="reporterName" render={({ field }) => <FormItem><FormLabel>Your name <span className="optional-label">OPTIONAL</span></FormLabel><FormControl><Input placeholder="How should we credit this report?" {...field} data-testid="input-reporter-name" /></FormControl><FormMessage /></FormItem>} />
            {submitError && <div className="submit-error" role="alert" data-testid="error-submit-report"><CircleAlert size={17} />{submitError}</div>}
            <div className="submit-row"><p><ShieldCheck size={15} /> Your report helps your community take action.</p><Button type="submit" disabled={create.isPending || upload.isPending} className="submit-button" data-testid="button-submit-report">{create.isPending || upload.isPending ? 'Sending report…' : 'Send report'}{!(create.isPending || upload.isPending) && <ArrowUpRight size={16} />}</Button></div>
          </form>
        </Form>
      </div>
      <aside className="form-aside">
        <div className="aside-number">01<span>—</span>03</div><div className="aside-line" />
        <span className="section-kicker">GOOD REPORTS TRAVEL FAR</span><h3>Details make<br />the difference.</h3><p>A clear location and a few specifics can help your report get to the right crew.</p>
        <div className="aside-checks"><div><span><Check size={12} /></span><p>Describe what’s damaged</p></div><div><span><Check size={12} /></span><p>Pinpoint the nearest address</p></div><div><span><Check size={12} /></span><p>Share the level of risk</p></div></div>
        <div className="aside-note"><span className="note-mark">“</span><p>One neighbor’s observation can be the start of a safer street for everyone.</p></div>
      </aside>
    </div>
  </div>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the selected photo.'));
    reader.readAsDataURL(file);
  });
}

function ReportDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const reportQuery = useGetReport(id, { query: { enabled: Boolean(id), queryKey: getGetReportQueryKey(id), retry: 1 } });
  const report = reportQuery.data;
  if (reportQuery.isLoading) return <div className="detail-loading animate-rise"><div className="skeleton detail-skeleton" /><div className="skeleton detail-skeleton" /><div className="skeleton detail-skeleton" /></div>;
  if (reportQuery.isError || !report) return <div className="detail-error"><Link href="/" className="back-link" data-testid="link-back-from-error"><ArrowLeft size={15} /> Back to street pulse</Link><div className="error-state" role="alert" data-testid="error-report-detail"><CircleAlert size={20} /><div><strong>We couldn’t find that report.</strong><p>It may have moved, or the tracking link may be incomplete.</p></div><Button variant="outline" onClick={() => reportQuery.refetch()} data-testid="button-retry-detail">Try again</Button></div></div>;
  const currentIndex = stages.indexOf(report.status);
  return <div className="detail-page animate-rise">
    <Link href="/" className="back-link" data-testid="link-back-dashboard-detail"><ArrowLeft size={15} /> All reports</Link>
    <div className="detail-heading">
      <div><div className="section-kicker"><span className="kicker-rule" /> REPORT TRACKING <span className="tracking-id">{report.trackingCode}</span></div><h1>{report.title}<span>.</span></h1><div className="detail-address"><MapPin size={16} />{report.address}</div></div>
      <StatusPill status={report.status} />
    </div>
    <div className="detail-grid">
      <section className="tracking-card" data-testid={`report-detail-${report.id}`}>
        <div className="tracking-card-top"><div><span className="section-kicker">CITY RESPONSE</span><h2>Where things stand</h2></div><span className="tracking-locator"><span className="live-dot" /> TRACKING ACTIVE</span></div>
        <p className="status-summary">{statusCopy[report.status]}</p>
        <div className={`progress-rail progress-${report.status}`} aria-label={`Report status: ${statusNames[report.status]}`} data-testid="report-status-progress">
          {stages.map((stage, index) => {
            const complete = index <= currentIndex;
            return <div key={stage} className={`progress-step ${complete ? 'step-complete' : ''} ${index === currentIndex ? 'step-current' : ''}`} data-testid={`progress-step-${stage}`}>
              <span className="progress-dot">{complete && index < currentIndex ? <Check size={12} /> : String(index + 1).padStart(2, '0')}</span><span className="progress-name">{statusNames[stage]}</span>
            </div>;
          })}
        </div>
        <div className="tracking-note"><span className="tracking-note-icon"><Clock3 size={16} /></span><span><strong>Reported {new Date(report.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</strong><small>Updates will appear here as the report moves forward.</small></span></div>
      </section>
      <aside className="detail-side">
        {report.photoUrl && <div className="report-photo-frame"><img src={report.photoUrl.startsWith('/api/uploads/') ? report.photoUrl : report.photoId ? `/api/uploads/${report.photoId}` : report.photoUrl} alt={`Photo submitted for ${report.title}`} data-testid="img-report-photo" /></div>}
        <div className="issue-facts"><span className="section-kicker">REPORT DETAILS</span><div className="fact-line"><span>Issue severity</span><SeverityMark severity={report.severity} /></div><div className="fact-line"><span>Report reference</span><strong className="mono-reference" data-testid="text-detail-tracking-code">{report.trackingCode}</strong></div><div className="fact-line"><span>Submitted by</span><strong>{report.reporterName || 'A neighborhood resident'}</strong></div></div>
        <div className="detail-help"><ShieldCheck size={19} /><p>This report stays visible so neighbors can follow the same road issue through resolution.</p></div>
      </aside>
    </div>
    <section className="detail-next"><div><span className="section-kicker">KEEP THE LOOP GOING</span><h2>Notice something else?</h2><p>Every clear report helps build a more complete picture of our streets.</p></div><Link href="/report" className="button-primary" data-testid="button-another-report">Make another report <ArrowUpRight size={16} /></Link></section>
  </div>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><PageFrame /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
