import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Award,
  Bell,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Download,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Mail,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import {
  createIntern,
  createEvaluation,
  createLeaveRequest,
  createTask,
  downloadCertificate,
  downloadDashboardReport,
  archiveIntern,
  getDashboard,
  getInternDashboard,
  getTasks,
  changeInternPassword,
  changeAdminPassword,
  loginAdmin,
  loginIntern,
  markAttendance,
  reviewLeaveRequest,
  registerAdmin,
  sendBroadcastMessage,
  sendInternMessage,
  reviewTaskSubmission,
  updateAdminProfile,
  updateIntern,
  updateTaskFromIntern,
  updateTask,
  verifyCertificate,
} from './api/dashboardApi';
import './App.css';

const SESSION_KEY = 'intern_tracking_portal_session';
const sections = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'interns', label: 'Interns', icon: Users },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'evaluations', label: 'Evaluations', icon: Award },
  { id: 'certificates', label: 'Certificates', icon: CheckCircle2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];
const toneClassMap = {
  neutral: 'tone-neutral',
  success: 'tone-success',
  warning: 'tone-warning',
  danger: 'tone-danger',
};
const documentSlotLabels = {
  resume: 'Resume',
  offer_letter: 'Offer Letter',
  nda: 'NDA',
  completion_report: 'Completion Report',
  certificate_copy: 'Certificate Copy',
};
const emptyInternForm = {
  name: '', email: '', phone: '', college: '', domain: '', skills: '', mentor: '', batch: 'Current Cycle',
  emergency_contact: '', notes: '', start_date: '', end_date: '', status: 'On Track',
  document_records: {},
};
const emptyTaskForm = {
  title: '', description: '', assigned_to: '', priority: 'Medium', start_date: '',
  deadline: '', status: 'Pending', progress: 0, deliverable: '', project_template: '',
};
const emptyAttendanceForm = { date: '', records: {} };
const emptyEvaluationForm = { intern_id: '', communication: 8, technical_skill: 8, teamwork: 8, ownership: 8, comments: '', evaluation_date: '' };
const emptyLoginForm = { email: '', password: '' };
const emptyRegisterForm = { name: '', email: '', password: '' };
const emptyAdminProfileForm = {
  name: '', email: '', role: 'System Administrator', phone: '', designation: 'System Administrator',
  organization: 'Intern Tracker Labs', access_level: 'Super Admin', availability: 'Online', profile_photo: '',
  notification_preferences: {
    attendance_alerts: true,
    task_alerts: true,
    mail_updates: true,
    weekly_summary: true,
    email_frequency: 'Immediate',
  },
};
const emptyMessageForm = { subject: '', message: '' };
const emptyBroadcastForm = { subject: '', message: '', recipient_mode: 'all', selected_intern_ids: [] };
const emptyInternProfileForm = {
  name: '',
  email: '',
  phone: '',
  college: '',
  batch: 'Current Cycle',
  domain: '',
  skills: '',
  profile_photo: '',
};
const emptyInternTaskUpdateForm = {
  task_id: '',
  progress: 0,
  status: 'In Progress',
  update_note: '',
  github_link: '',
  deployed_link: '',
  proof_note: '',
  report_file: null,
  screenshot_file: null,
};
const emptyLeaveRequestForm = { start_date: '', end_date: '', reason: '' };
const internSections = [
  { id: 'profile', label: 'My Profile', icon: Users },
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'attendance', label: 'Attendance', icon: CalendarRange },
  { id: 'certificates', label: 'Certificates', icon: CheckCircle2 },
  { id: 'inbox', label: 'Inbox', icon: Mail },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function AnimatedCounter({ value }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frameId;
    let start;
    const duration = 900;

    const tick = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setDisplayValue(Math.round(progress * value));
      if (progress < 1) frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [value]);

  return displayValue;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function relativeTime(value) {
  if (!value) return 'No recent activity';
  const target = new Date(value);
  const diffHours = Math.round((target.getTime() - Date.now()) / (1000 * 60 * 60));
  const absHours = Math.abs(diffHours);
  if (absHours < 24) return diffHours <= 0 ? `${absHours || 1}h ago` : `in ${absHours}h`;
  const days = Math.round(absHours / 24);
  return diffHours <= 0 ? `${days}d ago` : `in ${days}d`;
}

function getDocumentEntries(records) {
  return Object.entries(records || {}).map(([key, value]) => ({
    key,
    label: value?.label || documentSlotLabels[key] || key,
    file_name: value?.file_name || '',
    content_type: value?.content_type || '',
    data_url: value?.data_url || '',
    uploaded_at: value?.uploaded_at || '',
  }));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

function downloadDataUrl(dataUrl, fileName) {
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName || 'download';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function PerformanceLineGraph({ items }) {
  const width = 760;
  const height = 250;
  const padding = 28;
  const maxScore = Math.max(...items.map((item) => item.score), 100);
  const points = items.map((item, index) => {
    const x = padding + (index * ((width - padding * 2) / Math.max(items.length - 1, 1)));
    const y = height - padding - ((item.score / maxScore) * (height - padding * 2));
    return { ...item, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <div className="line-chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" role="img" aria-label="Student performance line graph">
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = height - padding - ((tick / 100) * (height - padding * 2));
          return (
            <g key={tick}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} className="chart-grid-line" />
              <text x={5} y={y + 4} className="chart-grid-label">{tick}</text>
            </g>
          );
        })}
        <motion.path
          d={path}
          fill="none"
          stroke="url(#performanceLine)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1 }}
        />
        <defs>
          <linearGradient id="performanceLine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
        {points.map((point) => (
          <g key={point.internId}>
            <motion.circle cx={point.x} cy={point.y} r="6" fill="#fff" stroke="#0f766e" strokeWidth="3" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15 }} />
            <text x={point.x} y={height - 6} textAnchor="middle" className="chart-axis-label">{point.name.split(' ')[0]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function AuthScreen({
  accessMode,
  authMode, loginForm, registerForm, onLoginChange, onRegisterChange,
  onLogin, onRegister, setAuthMode, setAccessMode, authLoading, error,
}) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <p className="eyebrow">Admin Access</p>
          <h1>Intern Tracking System</h1>
          <p>{accessMode === 'admin' ? 'Sign in as an admin to manage interns, tasks, attendance, and certification readiness.' : 'Sign in as an intern to view your tasks, attendance, performance, and certificate status.'}</p>
          <div className="default-credentials">
            {accessMode === 'admin' ? (
              <>
                <strong>Demo admin</strong>
                <span>Email: admin@interntrack.com</span>
                <span>Password: admin123</span>
              </>
            ) : (
              <>
                <strong>Demo intern</strong>
                <span>Email: aarav.sharma@example.com</span>
                <span>Password: intern123</span>
                <span>Email: chandanchandukv2005@gmail.com</span>
                <span>Password: chandan123</span>
              </>
            )}
          </div>
        </div>
        <div className="auth-panel">
          <div className="auth-toggle">
            <button type="button" className={accessMode === 'admin' ? 'auth-tab active' : 'auth-tab'} onClick={() => setAccessMode('admin')}>Admin</button>
            <button type="button" className={accessMode === 'intern' ? 'auth-tab active' : 'auth-tab'} onClick={() => setAccessMode('intern')}>Intern</button>
          </div>
          {accessMode === 'admin' ? <div className="auth-toggle">
            <button type="button" className={authMode === 'login' ? 'auth-tab active' : 'auth-tab'} onClick={() => setAuthMode('login')}>Login</button>
            <button type="button" className={authMode === 'register' ? 'auth-tab active' : 'auth-tab'} onClick={() => setAuthMode('register')}>Register</button>
          </div> : null}
          {error ? <div className="inline-error">{error}</div> : null}
          {accessMode === 'intern' || authMode === 'login' ? (
            <form className="auth-form" onSubmit={onLogin}>
              <label>{accessMode === 'admin' ? 'Admin email' : 'Intern email'}<input name="email" type="email" value={loginForm.email} onChange={onLoginChange} required /></label>
              <label>Password<input name="password" type="password" value={loginForm.password} onChange={onLoginChange} required /></label>
              <button className="primary-button auth-submit" type="submit" disabled={authLoading}>{authLoading ? 'Signing in...' : accessMode === 'admin' ? 'Login' : 'Enter Portal'}</button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={onRegister}>
              <label>Admin name<input name="name" value={registerForm.name} onChange={onRegisterChange} required /></label>
              <label>Admin email<input name="email" type="email" value={registerForm.email} onChange={onRegisterChange} required /></label>
              <label>Password<input name="password" type="password" value={registerForm.password} onChange={onRegisterChange} required /></label>
              <button className="primary-button auth-submit" type="submit" disabled={authLoading}>{authLoading ? 'Creating...' : 'Create Admin'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [internDashboard, setInternDashboard] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showInternModal, setShowInternModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [showInternProfileModal, setShowInternProfileModal] = useState(false);
  const [showInternTaskUpdateModal, setShowInternTaskUpdateModal] = useState(false);
  const [showInternDetailModal, setShowInternDetailModal] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [editingIntern, setEditingIntern] = useState(null);
  const [selectedInternForMessage, setSelectedInternForMessage] = useState(null);
  const [selectedInternDetail, setSelectedInternDetail] = useState(null);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [sectionFocus, setSectionFocus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('All Domains');
  const [mentorFilter, setMentorFilter] = useState('All Mentors');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [batchFilter, setBatchFilter] = useState('All Batches');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showInternNotifications, setShowInternNotifications] = useState(false);
  const [showAdminProfile, setShowAdminProfile] = useState(false);
  const [isEditingAdminProfile, setIsEditingAdminProfile] = useState(false);
  const [internForm, setInternForm] = useState(emptyInternForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [attendanceForm, setAttendanceForm] = useState(emptyAttendanceForm);
  const [evaluationForm, setEvaluationForm] = useState(emptyEvaluationForm);
  const [adminProfileForm, setAdminProfileForm] = useState(emptyAdminProfileForm);
  const [loginForm, setLoginForm] = useState(emptyLoginForm);
  const [registerForm, setRegisterForm] = useState(emptyRegisterForm);
  const [messageForm, setMessageForm] = useState(emptyMessageForm);
  const [broadcastForm, setBroadcastForm] = useState(emptyBroadcastForm);
  const [internProfileForm, setInternProfileForm] = useState(emptyInternProfileForm);
  const [internTaskUpdateForm, setInternTaskUpdateForm] = useState(emptyInternTaskUpdateForm);
  const [leaveRequestForm, setLeaveRequestForm] = useState(emptyLeaveRequestForm);
  const [adminSession, setAdminSession] = useState(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });
  const [authMode, setAuthMode] = useState('login');
  const [accessMode, setAccessMode] = useState('admin');
  const [internSection, setInternSection] = useState('overview');
  const [authLoading, setAuthLoading] = useState(false);
  const [isSavingIntern, setIsSavingIntern] = useState(false);
  const [isTaskSubmitting, setIsTaskSubmitting] = useState(false);
  const [isAttendanceSubmitting, setIsAttendanceSubmitting] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [isSavingInternProfile, setIsSavingInternProfile] = useState(false);
  const [isSubmittingInternTaskUpdate, setIsSubmittingInternTaskUpdate] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [isChangingInternPassword, setIsChangingInternPassword] = useState(false);
  const [isChangingAdminPassword, setIsChangingAdminPassword] = useState(false);
  const [downloadingCertificateId, setDownloadingCertificateId] = useState('');
  const [certificateLookupId, setCertificateLookupId] = useState('');
  const [certificateLookupResult, setCertificateLookupResult] = useState(null);
  const [internPasswordForm, setInternPasswordForm] = useState({ current_password: '', new_password: '' });
  const [adminPasswordForm, setAdminPasswordForm] = useState({ current_password: '', new_password: '' });
  const [internTaskFilter, setInternTaskFilter] = useState('all');
  const [isSubmittingEvaluation, setIsSubmittingEvaluation] = useState(false);
  const [isSubmittingLeaveRequest, setIsSubmittingLeaveRequest] = useState(false);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hasOpenModal = showInternModal || showMessageModal || showBroadcastModal || showInternProfileModal || showInternTaskUpdateModal || showInternDetailModal || showEvaluationModal;

  const maxTaskValue = useMemo(() => {
    if (!dashboard?.taskCompletion?.length) return 1;
    return Math.max(...dashboard.taskCompletion.map((item) => item.value), 1);
  }, [dashboard]);

  const heatmapGridStyle = useMemo(() => {
    const totalDates = dashboard?.attendanceHeatmap?.dates?.length || 14;
    return { gridTemplateColumns: `160px repeat(${totalDates}, minmax(18px, 1fr))` };
  }, [dashboard]);

  const projectTemplateMap = useMemo(() => (
    new Map((dashboard?.projectTemplates || []).map((template) => [template.id, template]))
  ), [dashboard]);
  const domainOptions = useMemo(() => ['All Domains', ...new Set((dashboard?.interns || []).map((intern) => intern.domain))], [dashboard]);
  const mentorOptions = useMemo(() => ['All Mentors', ...new Set((dashboard?.interns || []).map((intern) => intern.mentor))], [dashboard]);
  const statusOptions = useMemo(() => ['All Statuses', ...new Set((dashboard?.interns || []).map((intern) => intern.status))], [dashboard]);
  const batchOptions = useMemo(() => ['All Batches', ...(dashboard?.batchOptions || [])], [dashboard]);
  const filteredInterns = useMemo(() => {
    if (!dashboard?.interns) return [];
    let interns = dashboard.interns;
    if (sectionFocus === 'pending-approvals') {
      interns = interns.filter((intern) => intern.status !== 'On Track');
    }
    if (domainFilter !== 'All Domains') interns = interns.filter((intern) => intern.domain === domainFilter);
    if (mentorFilter !== 'All Mentors') interns = interns.filter((intern) => intern.mentor === mentorFilter);
    if (statusFilter !== 'All Statuses') interns = interns.filter((intern) => intern.status === statusFilter);
    if (batchFilter !== 'All Batches') interns = interns.filter((intern) => intern.batch === batchFilter);
    if (!normalizedQuery) return interns;
    return interns.filter((intern) => [intern.name, intern.email, intern.domain, intern.mentor, intern.status, intern.batch, intern.college, (intern.skills || []).join(' ')].join(' ').toLowerCase().includes(normalizedQuery));
  }, [dashboard, normalizedQuery, sectionFocus, domainFilter, mentorFilter, statusFilter, batchFilter]);
  const filteredTasks = useMemo(() => {
    let visibleTasks = tasks;
    if (sectionFocus === 'pending-tasks') {
      visibleTasks = visibleTasks.filter((task) => task.status !== 'Completed');
    }
    if (sectionFocus === 'completed-tasks') {
      visibleTasks = visibleTasks.filter((task) => task.status === 'Completed');
    }
    if (sectionFocus === 'overdue-tasks') {
      visibleTasks = visibleTasks.filter((task) => new Date(task.deadline) < new Date() && task.status !== 'Completed');
    }
    if (sectionFocus === 'deadline-status') {
      visibleTasks = visibleTasks.filter((task) => task.status !== 'Completed');
    }
    if (!normalizedQuery) return visibleTasks;
    return visibleTasks.filter((task) => [task.title, task.description, task.priority, task.status, task.deliverable].join(' ').toLowerCase().includes(normalizedQuery));
  }, [tasks, normalizedQuery, sectionFocus]);
  const filteredPerformance = useMemo(() => {
    if (!dashboard?.performanceAnalysis) return [];
    if (!normalizedQuery) return dashboard.performanceAnalysis;
    return dashboard.performanceAnalysis.filter((item) => `${item.name} ${item.band}`.toLowerCase().includes(normalizedQuery));
  }, [dashboard, normalizedQuery]);
  const notificationCount = useMemo(() => {
    if (!dashboard) return 0;
    return dashboard.alerts.lowAttendance.length + dashboard.alerts.pendingTasks.length + (dashboard.notificationSummary?.queuedEmails || 0);
  }, [dashboard]);
  const internNotificationItems = useMemo(() => {
    if (!internDashboard?.recentActivity) return [];
    return internDashboard.recentActivity.filter((item) => ['task', 'attendance', 'announcement', 'email', 'evaluation'].includes(item.kind));
  }, [internDashboard]);
  const internVisibleTasks = useMemo(() => {
    if (!internDashboard?.tasks) return [];
    if (internTaskFilter === 'completed') return internDashboard.tasks.filter((task) => task.status === 'Completed');
    if (internTaskFilter === 'pending') return internDashboard.tasks.filter((task) => task.status !== 'Completed');
    return internDashboard.tasks;
  }, [internDashboard, internTaskFilter]);

  const loadDashboard = useCallback(async () => {
    if (!adminSession) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      if (adminSession.role_type === 'intern') {
        const data = await getInternDashboard(adminSession.id);
        setInternDashboard(data);
        setDashboard(null);
        setTasks([]);
      } else {
        const [data, taskItems] = await Promise.all([getDashboard(), getTasks()]);
        setDashboard(data);
        setTasks(taskItems);
        setInternDashboard(null);
      }
    } catch (err) {
      setError(err.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [adminSession]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!dashboard?.interns?.length) return;
    setTaskForm((current) => ({
      ...current,
      assigned_to: current.assigned_to || dashboard.interns[0].id,
      start_date: current.start_date || new Date().toISOString().slice(0, 10),
      deadline: current.deadline || new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    }));
    setAttendanceForm((current) => ({
      ...current,
      date: current.date || new Date().toISOString().slice(0, 10),
      records: dashboard.interns.reduce((accumulator, intern) => {
        accumulator[intern.id] = current.records?.[intern.id] || 'Present';
        return accumulator;
      }, {}),
    }));
    setEvaluationForm((current) => ({
      ...current,
      intern_id: current.intern_id || dashboard.interns[0].id,
      evaluation_date: current.evaluation_date || new Date().toISOString().slice(0, 10),
    }));
  }, [dashboard]);

  useEffect(() => {
    document.body.classList.toggle('modal-open', hasOpenModal);
    return () => document.body.classList.remove('modal-open');
  }, [hasOpenModal]);

  useEffect(() => {
    if (!adminSession) return;
    setAdminProfileForm({
      name: adminSession.name || '',
      email: adminSession.email || '',
      role: adminSession.role || 'System Administrator',
      phone: adminSession.phone || '',
      designation: adminSession.designation || adminSession.role || 'System Administrator',
      organization: adminSession.organization || 'Intern Tracker Labs',
      access_level: adminSession.access_level || 'Super Admin',
      availability: adminSession.availability || 'Online',
      profile_photo: adminSession.profile_photo || '',
      notification_preferences: adminSession.notification_preferences || emptyAdminProfileForm.notification_preferences,
    });
  }, [adminSession]);

  useEffect(() => {
    if (!internDashboard?.profile) return;
    setInternProfileForm({
      name: internDashboard.profile.name || '',
      email: internDashboard.profile.email || '',
      phone: internDashboard.profile.phone || '',
      college: internDashboard.profile.college || '',
      batch: internDashboard.profile.batch || 'Current Cycle',
      domain: internDashboard.profile.domain || '',
      skills: (internDashboard.profile.skills || []).join(', '),
      profile_photo: internDashboard.profile.profile_photo || '',
    });
  }, [internDashboard]);

  const handleAdminProfilePhotoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAdminProfileForm((current) => ({ ...current, profile_photo: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = window.setTimeout(() => setSuccessMessage(''), 3000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const openAddIntern = () => {
    setSectionFocus('all');
    setEditingIntern(null);
    setInternForm(emptyInternForm);
    setShowInternModal(true);
  };

  const openEditIntern = (intern) => {
    setEditingIntern(intern);
    setInternForm({
      name: intern.name,
      email: intern.email,
      phone: intern.phone || '',
      college: intern.college || '',
      domain: intern.domain,
      skills: (intern.skills || []).join(', '),
      mentor: intern.mentor,
      batch: intern.batch || 'Current Cycle',
      emergency_contact: intern.emergency_contact || '',
      notes: intern.notes || '',
      start_date: intern.startDate,
      end_date: intern.endDate,
      status: intern.status === 'Certificate Ready' ? 'On Track' : intern.status,
      document_records: intern.documentRecords || {},
    });
    setShowInternModal(true);
  };

  const openInternDetail = (intern) => {
    setSelectedInternDetail(intern);
    setShowInternDetailModal(true);
  };

  const openMessageComposer = (intern) => {
    setSelectedInternForMessage(intern);
    setMessageForm({
      subject: `Update regarding your internship progress`,
      message: `Hi ${intern.name},\n\nSharing an important update regarding your internship. Please review your current tasks and reach out if you need support.\n\nRegards,\n${adminSession?.name || 'Admin'}`,
    });
    setShowMessageModal(true);
  };

  const openBroadcastComposer = () => {
    setBroadcastForm((current) => ({
      ...current,
      recipient_mode: 'all',
      selected_intern_ids: [],
    }));
    setShowBroadcastModal(true);
  };

  const openInternProfileEditor = () => {
    if (!internDashboard?.profile) return;
    setInternProfileForm({
      name: internDashboard.profile.name || '',
      email: internDashboard.profile.email || '',
      phone: internDashboard.profile.phone || '',
      college: internDashboard.profile.college || '',
      batch: internDashboard.profile.batch || 'Current Cycle',
      domain: internDashboard.profile.domain || '',
      skills: (internDashboard.profile.skills || []).join(', '),
      profile_photo: internDashboard.profile.profile_photo || '',
    });
    setShowInternProfileModal(true);
  };

  const handleInternProfilePhotoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setInternProfileForm((current) => ({ ...current, profile_photo: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const handleAuthSuccess = (admin) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(admin));
    setAdminSession(admin);
    setSuccessMessage(`Welcome, ${admin.name}.`);
    setError('');
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    try {
      setAuthLoading(true);
      setError('');
      if (accessMode === 'intern') {
        const response = await loginIntern(loginForm);
        handleAuthSuccess(response.intern);
      } else {
        const response = await loginAdmin(loginForm);
        handleAuthSuccess(response.admin);
      }
      setLoginForm(emptyLoginForm);
    } catch (err) {
      setError(err.message || 'Unable to login.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    try {
      setAuthLoading(true);
      setError('');
      const response = await registerAdmin(registerForm);
      handleAuthSuccess(response.admin);
      setRegisterForm(emptyRegisterForm);
    } catch (err) {
      setError(err.message || 'Unable to register admin.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setAdminSession(null);
    setDashboard(null);
    setInternDashboard(null);
    setTasks([]);
    setSearchQuery('');
    setShowNotifications(false);
    setShowInternNotifications(false);
    setShowAdminProfile(false);
    setShowInternProfileModal(false);
    setShowInternTaskUpdateModal(false);
    setIsEditingAdminProfile(false);
    setShowBroadcastModal(false);
    setShowInternDetailModal(false);
    setActiveSection('dashboard');
    setInternSection('overview');
    setSectionFocus('all');
    setDomainFilter('All Domains');
    setMentorFilter('All Mentors');
    setStatusFilter('All Statuses');
    setBatchFilter('All Batches');
    setInternTaskFilter('all');
  };

  const handleInternPasswordChange = async (event) => {
    event.preventDefault();
    try {
      setIsChangingInternPassword(true);
      setError('');
      const response = await changeInternPassword(adminSession.id, internPasswordForm);
      setSuccessMessage(response.message || 'Password updated successfully.');
      setInternPasswordForm({ current_password: '', new_password: '' });
    } catch (err) {
      setError(err.message || 'Unable to update password.');
    } finally {
      setIsChangingInternPassword(false);
    }
  };

  const handleInternStatNavigation = (label) => {
    if (label === 'Attendance') {
      setInternSection('attendance');
      return;
    }
    if (label === 'Tasks Completed') {
      setInternTaskFilter('completed');
      setInternSection('tasks');
      return;
    }
    if (label === 'Pending Tasks') {
      setInternTaskFilter('pending');
      setInternSection('tasks');
      return;
    }
    if (label === 'Performance Score') {
      setInternSection('overview');
      return;
    }
    setInternSection('overview');
  };

  const handleAdminPasswordChange = async (event) => {
    event.preventDefault();
    try {
      setIsChangingAdminPassword(true);
      setError('');
      const response = await changeAdminPassword(adminSession.id, adminPasswordForm);
      setSuccessMessage(response.message || 'Admin password updated successfully.');
      setAdminPasswordForm({ current_password: '', new_password: '' });
    } catch (err) {
      setError(err.message || 'Unable to update admin password.');
    } finally {
      setIsChangingAdminPassword(false);
    }
  };

  const handleAdminProfileSave = async (event) => {
    event.preventDefault();
    try {
      setError('');
      const response = await updateAdminProfile(adminSession.id, adminProfileForm);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(response.admin));
      setAdminSession(response.admin);
      setIsEditingAdminProfile(false);
      setSuccessMessage(response.message || 'Admin profile updated successfully.');
    } catch (err) {
      setError(err.message || 'Unable to update admin profile.');
    }
  };

  const handleInternProfileSave = async (event) => {
    event.preventDefault();
    if (!adminSession?.id) return;
    try {
      setIsSavingInternProfile(true);
      setError('');
      await updateIntern(adminSession.id, {
        name: internProfileForm.name,
        email: internProfileForm.email,
        phone: internProfileForm.phone,
        college: internProfileForm.college,
        batch: internProfileForm.batch,
        domain: internProfileForm.domain,
        skills: internProfileForm.skills.split(',').map((item) => item.trim()).filter(Boolean),
        profile_photo: internProfileForm.profile_photo || '',
      });
      setShowInternProfileModal(false);
      setSuccessMessage('Profile updated successfully.');
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to update intern profile.');
    } finally {
      setIsSavingInternProfile(false);
    }
  };

  const handleInternDocumentUpload = async (slot, file) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setInternForm((current) => ({
        ...current,
        document_records: {
          ...(current.document_records || {}),
          [slot]: {
            label: documentSlotLabels[slot] || slot,
            file_name: file.name,
            content_type: file.type || 'application/octet-stream',
            data_url: dataUrl,
            uploaded_at: new Date().toISOString(),
          },
        },
      }));
    } catch (err) {
      setError(err.message || 'Unable to upload document.');
    }
  };

  const handleInternDocumentRemove = (slot) => {
    setInternForm((current) => {
      const nextRecords = { ...(current.document_records || {}) };
      delete nextRecords[slot];
      return { ...current, document_records: nextRecords };
    });
  };

  const handleTaskProofFileUpload = async (field, file) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setInternTaskUpdateForm((current) => ({
        ...current,
        [field]: {
          file_name: file.name,
          content_type: file.type || 'application/octet-stream',
          data_url: dataUrl,
        },
      }));
    } catch (err) {
      setError(err.message || 'Unable to upload proof file.');
    }
  };

  const openInternTaskUpdate = (task) => {
    setInternTaskUpdateForm({
      task_id: task.id,
      progress: task.progress || 0,
      status: task.status === 'Completed' ? 'Completed' : 'In Progress',
      update_note: '',
      github_link: task.submission?.github_link || '',
      deployed_link: task.submission?.deployed_link || '',
      proof_note: task.submission?.note || '',
      report_file: task.submission?.report_file || null,
      screenshot_file: task.submission?.screenshot_file || null,
    });
    setShowInternTaskUpdateModal(true);
  };

  const handleInternTaskUpdateSubmit = async (event) => {
    event.preventDefault();
    try {
      setIsSubmittingInternTaskUpdate(true);
      setError('');
      await updateTaskFromIntern(internTaskUpdateForm.task_id, {
        intern_id: adminSession.id,
        progress: Number(internTaskUpdateForm.progress),
        status: internTaskUpdateForm.status,
        update_note: internTaskUpdateForm.update_note,
        submission: {
          github_link: internTaskUpdateForm.github_link,
          deployed_link: internTaskUpdateForm.deployed_link,
          note: internTaskUpdateForm.proof_note,
          report_file: internTaskUpdateForm.report_file,
          screenshot_file: internTaskUpdateForm.screenshot_file,
        },
      });
      setShowInternTaskUpdateModal(false);
      setInternTaskUpdateForm(emptyInternTaskUpdateForm);
      setSuccessMessage('Task update sent to mentor/admin and progress saved.');
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to submit task update.');
    } finally {
      setIsSubmittingInternTaskUpdate(false);
    }
  };

  const handleInternSave = async (event) => {
    event.preventDefault();
    try {
      setIsSavingIntern(true);
      setError('');
      if (editingIntern) {
        await updateIntern(editingIntern.id, {
          ...internForm,
          skills: internForm.skills.split(',').map((item) => item.trim()).filter(Boolean),
          documents: getDocumentEntries(internForm.document_records).map((item) => item.label),
          document_records: internForm.document_records || {},
        });
        setSuccessMessage('Intern updated successfully. Related active deadlines were synced where needed.');
      } else {
        await createIntern({
          ...internForm,
          skills: internForm.skills.split(',').map((item) => item.trim()).filter(Boolean),
          documents: getDocumentEntries(internForm.document_records).map((item) => item.label),
          document_records: internForm.document_records || {},
        });
        setSuccessMessage('Intern added successfully.');
      }
      setShowInternModal(false);
      setInternForm(emptyInternForm);
      setEditingIntern(null);
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to save intern.');
    } finally {
      setIsSavingIntern(false);
    }
  };

  const handleSubmissionReview = async (taskId, reviewStatus) => {
    try {
      setError('');
      await reviewTaskSubmission(taskId, {
        review_status: reviewStatus,
        admin_feedback: reviewStatus === 'Rejected' ? 'Please update the proof and resubmit.' : 'Submission reviewed and accepted.',
      });
      setSuccessMessage(`Task proof ${reviewStatus.toLowerCase()} successfully.`);
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to review task proof.');
    }
  };

  const handleLeaveRequestSubmit = async (event) => {
    event.preventDefault();
    try {
      setIsSubmittingLeaveRequest(true);
      setError('');
      await createLeaveRequest({ intern_id: adminSession.id, ...leaveRequestForm });
      setLeaveRequestForm(emptyLeaveRequestForm);
      setSuccessMessage('Leave request sent successfully.');
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to submit leave request.');
    } finally {
      setIsSubmittingLeaveRequest(false);
    }
  };

  const handleLeaveRequestReview = async (requestId, status) => {
    try {
      setError('');
      await reviewLeaveRequest(requestId, { status });
      setSuccessMessage(`Leave request ${status.toLowerCase()}.`);
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to review leave request.');
    }
  };

  const handleCertificateVerification = async (event) => {
    event.preventDefault();
    try {
      setError('');
      const response = await verifyCertificate(certificateLookupId.trim());
      setCertificateLookupResult(response);
      setSuccessMessage(response.valid ? 'Certificate verified successfully.' : 'Certificate found but not currently eligible.');
    } catch (err) {
      setCertificateLookupResult(null);
      setError(err.message || 'Unable to verify certificate.');
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!selectedInternForMessage) return;
    try {
      setIsSendingMessage(true);
      setError('');
      const response = await sendInternMessage(selectedInternForMessage.id, {
        subject: messageForm.subject,
        message: messageForm.message,
        sender_name: adminSession?.name || 'System Administrator',
        sender_email: adminSession?.email || 'admin@interntrack.com',
      });
      setSuccessMessage(response.message || `Email sent to ${selectedInternForMessage.email}.`);
      setShowMessageModal(false);
      setSelectedInternForMessage(null);
      setMessageForm(emptyMessageForm);
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to send email.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleBroadcastSend = async (event) => {
    event.preventDefault();
    try {
      setIsSendingBroadcast(true);
      setError('');
      const recipientIds = broadcastForm.recipient_mode === 'all' ? [] : broadcastForm.selected_intern_ids;
      if (broadcastForm.recipient_mode === 'filtered' && recipientIds.length === 0) {
        throw new Error('Select at least one intern to send the announcement.');
      }
      const response = await sendBroadcastMessage({
        subject: broadcastForm.subject,
        message: broadcastForm.message,
        sender_name: adminSession?.name || 'System Administrator',
        sender_email: adminSession?.email || 'admin@interntrack.com',
        intern_ids: recipientIds,
      });
      setSuccessMessage(response.message || 'Broadcast sent successfully.');
      setBroadcastForm(emptyBroadcastForm);
      setShowBroadcastModal(false);
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to send broadcast.');
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  const handleReportDownload = async () => {
    try {
      setIsDownloadingReport(true);
      const blob = await downloadDashboardReport();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'intern_dashboard_report.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSuccessMessage('Dashboard report downloaded.');
    } catch (err) {
      setError(err.message || 'Unable to download report.');
    } finally {
      setIsDownloadingReport(false);
    }
  };

  const handleTaskSubmit = async (event) => {
    event.preventDefault();
    try {
      setIsTaskSubmitting(true);
      setError('');
      await createTask(taskForm);
      setTaskForm({
        ...emptyTaskForm,
        assigned_to: dashboard?.interns?.[0]?.id || '',
        start_date: new Date().toISOString().slice(0, 10),
        deadline: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      });
      setSuccessMessage('Task assigned successfully.');
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to create task.');
    } finally {
      setIsTaskSubmitting(false);
    }
  };

  const handleTemplateSelection = (templateId) => {
    const selectedTemplate = projectTemplateMap.get(templateId);
    if (!selectedTemplate) {
      setTaskForm((current) => ({ ...current, project_template: '' }));
      return;
    }
    setTaskForm((current) => ({
      ...current,
      project_template: templateId,
      title: selectedTemplate.title,
      description: selectedTemplate.description,
      deliverable: selectedTemplate.deliverable,
      priority: selectedTemplate.priority,
    }));
  };

  const handleDashboardCardNavigation = (label) => {
    setShowNotifications(false);
    if (label === 'Active Interns' || label === 'Total Interns') {
      setSectionFocus('all');
      setActiveSection('interns');
      return;
    }
    if (label === 'Pending Approvals') {
      setSectionFocus('pending-approvals');
      setActiveSection('interns');
      return;
    }
    if (label === 'Upcoming Evaluations') {
      setSectionFocus('upcoming-evaluations');
      setActiveSection('evaluations');
      return;
    }
    if (label === 'Project Deadline Status') {
      setSectionFocus('deadline-status');
      setActiveSection('projects');
      return;
    }
    if (label === 'Tasks Completed') {
      setSectionFocus('completed-tasks');
      setActiveSection('projects');
      return;
    }
    if (label === 'Pending Tasks') {
      setSectionFocus('pending-tasks');
      setActiveSection('projects');
      return;
    }
    if (label === 'Overdue Tasks') {
      setSectionFocus('overdue-tasks');
      setActiveSection('projects');
      return;
    }
    setSectionFocus('all');
  };

  const clearSectionFocus = () => setSectionFocus('all');

  const handleAttendanceSubmit = async (event) => {
    event.preventDefault();
    try {
      setIsAttendanceSubmitting(true);
      setError('');
      await Promise.all(
        Object.entries(attendanceForm.records || {}).map(([intern_id, status]) => (
          markAttendance({
            intern_id,
            date: attendanceForm.date,
            status,
          })
        )),
      );
      setSuccessMessage('Attendance updated for all listed interns successfully.');
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to mark attendance.');
    } finally {
      setIsAttendanceSubmitting(false);
    }
  };

  const handleEvaluationSubmit = async (event) => {
    event.preventDefault();
    try {
      setIsSubmittingEvaluation(true);
      setError('');
      await createEvaluation({
        ...evaluationForm,
        communication: Number(evaluationForm.communication),
        technical_skill: Number(evaluationForm.technical_skill),
        teamwork: Number(evaluationForm.teamwork),
        ownership: Number(evaluationForm.ownership),
      });
      setSuccessMessage('Evaluation saved successfully.');
      setShowEvaluationModal(false);
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to save evaluation.');
    } finally {
      setIsSubmittingEvaluation(false);
    }
  };

  const handleTaskStatusUpdate = async (taskId, currentStatus, currentProgress) => {
    const nextStatus = currentStatus === 'Completed' ? 'In Progress' : 'Completed';
    const nextProgress = nextStatus === 'Completed' ? 100 : currentProgress || 65;
    try {
      setError('');
      await updateTask(taskId, { status: nextStatus, progress: nextProgress });
      setSuccessMessage(`Task marked as ${nextStatus}.`);
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to update task.');
    }
  };

  const handleArchiveToggle = async (intern) => {
    try {
      setError('');
      const response = await archiveIntern(intern.id);
      setSuccessMessage(response.message || 'Intern archive state updated.');
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to archive intern.');
    }
  };

  const handleCertificateDownload = async (certificate) => {
    try {
      setDownloadingCertificateId(certificate.internId);
      setError('');
      const blob = await downloadCertificate(certificate.internId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${certificate.name.replace(/\s+/g, '_').toLowerCase()}_certificate.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSuccessMessage(`Certificate downloaded for ${certificate.name}.`);
    } catch (err) {
      setError(err.message || 'Unable to download certificate.');
    } finally {
      setDownloadingCertificateId('');
    }
  };

  const renderOverview = () => (
    <>
      <section className="stats-grid widget-grid">
        {[
          { label: 'Active Interns', value: dashboard.widgets.activeInterns, description: 'Interns active in the current cycle.', icon: Users, tone: 'neutral' },
          { label: 'Pending Approvals', value: dashboard.widgets.pendingApprovals, description: 'Onboarding or attention-needed approvals.', icon: ShieldCheck, tone: 'warning' },
          { label: 'Upcoming Evaluations', value: dashboard.widgets.upcomingEvaluations, description: 'Evaluations due within the next 14 days.', icon: CalendarClock, tone: 'success' },
          { label: 'Project Deadline Status', value: dashboard.widgets.projectDeadlineStatus.overdue, description: `${dashboard.widgets.projectDeadlineStatus.dueToday} due today - ${dashboard.widgets.projectDeadlineStatus.upcoming} upcoming`, icon: AlertTriangle, tone: 'danger' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <motion.button type="button" key={item.label} className={`stat-card widget-card card-button ${toneClassMap[item.tone] || ''}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -6 }} onClick={() => handleDashboardCardNavigation(item.label)}>
              <div className="widget-topline">
                <span className="stat-label">{item.label}</span>
                <Icon size={18} />
              </div>
              <div className="stat-value"><AnimatedCounter value={item.value} /></div>
              <p>{item.description}</p>
            </motion.button>
          );
        })}
      </section>
      <section className="stats-grid">
        {dashboard.stats.map((item) => (
          <motion.button type="button" key={item.label} className={`stat-card card-button ${toneClassMap[item.tone] || ''}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} onClick={() => handleDashboardCardNavigation(item.label)}>
            <div className="stat-label">{item.label}</div>
            <div className="stat-value"><AnimatedCounter value={item.value} /></div>
            <p>{item.description}</p>
          </motion.button>
        ))}
      </section>
      <section className="dashboard-grid">
        <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel-header"><div><p className="panel-kicker">Task Completion Chart</p><h2>Delivery snapshot</h2></div><ClipboardList size={20} /></div>
          <div className="chart-stack">
            {dashboard.taskCompletion.map((item) => (
              <div key={item.label} className="chart-row">
                <div className="chart-labels"><span>{item.label}</span><strong>{item.value}</strong></div>
                <div className="chart-bar"><motion.span initial={{ width: 0 }} animate={{ width: `${(item.value / maxTaskValue) * 100}%` }} transition={{ duration: 0.8 }} /></div>
              </div>
            ))}
          </div>
        </motion.article>
        <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel-header"><div><p className="panel-kicker">Student Performance Graph</p><h2>Line graph performance trend</h2></div><Sparkles size={20} /></div>
          <PerformanceLineGraph items={filteredPerformance} />
          <div className="performance-legend">
            {filteredPerformance.map((item) => (
              <div key={item.internId} className="legend-pill">
                <span className={`performance-band ${item.band.toLowerCase()}`}>{item.band}</span>
                <strong>{item.name}</strong>
                <span>{item.score}/100</span>
              </div>
            ))}
          </div>
        </motion.article>
        <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel-header"><div><p className="panel-kicker">Recent Activity</p><h2>Latest updates</h2></div><CalendarRange size={20} /></div>
          <div className="activity-list">
            {dashboard.recentActivity.map((item) => (
              <motion.div key={item.id} className="activity-item" whileHover={{ x: 4 }}>
                <div className={`activity-dot activity-${item.kind}`} />
                <div><p>{item.message}</p><span>{relativeTime(item.timestamp)}</span></div>
              </motion.div>
            ))}
          </div>
        </motion.article>
        <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel-header"><div><p className="panel-kicker">Communication & Notifications</p><h2>Alerts and email delivery</h2></div><Mail size={20} /></div>
          <div className="alert-grid">
            <div className="alert-box">
              <h3>Low attendance</h3>
              {dashboard.alerts.lowAttendance.length ? dashboard.alerts.lowAttendance.map((item) => (
                <p key={item.internId}>{item.name} is at <strong>{item.attendanceRate}%</strong> attendance.</p>
              )) : <p>All interns are above the alert threshold.</p>}
            </div>
            <div className="alert-box">
              <h3>Mail delivery status</h3>
              <p>SMTP: <strong>{dashboard.notificationSummary.smtpConfigured ? 'Configured' : 'Saved to outbox'}</strong></p>
              <p>Queued emails: <strong>{dashboard.notificationSummary.queuedEmails}</strong></p>
              <p>Auto-check interval: <strong>{dashboard.notificationSummary.pollSeconds}s</strong></p>
            </div>
          </div>
        </motion.article>
      </section>
      <section className="dashboard-grid">
        <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel-header"><div><p className="panel-kicker">Quick Actions</p><h2>Admin shortcuts</h2></div><Sparkles size={20} /></div>
          <div className="quick-action-grid">
            {dashboard.quickActions.map((action) => (
              <button key={action.id} type="button" className="quick-action-card" onClick={() => setActiveSection(action.section)}>
                <strong>{action.label}</strong>
                <span>Open {action.section}</span>
              </button>
            ))}
            <button type="button" className="quick-action-card" onClick={handleReportDownload}>
              <strong>{isDownloadingReport ? 'Preparing report...' : 'Download Report'}</strong>
              <span>CSV export of current internship data</span>
            </button>
          </div>
        </motion.article>
        <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel-header"><div><p className="panel-kicker">Domain Distribution</p><h2>Interns by domain</h2></div><Users size={20} /></div>
          <div className="chart-stack">
            {dashboard.domainDistribution.map((item) => (
              <div key={item.label} className="chart-row">
                <div className="chart-labels"><span>{item.label}</span><strong>{item.value}</strong></div>
                <div className="chart-bar"><motion.span initial={{ width: 0 }} animate={{ width: `${(item.value / Math.max(dashboard.widgets.activeInterns, 1)) * 100}%` }} transition={{ duration: 0.8 }} /></div>
              </div>
            ))}
          </div>
        </motion.article>
        <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel-header"><div><p className="panel-kicker">Mentor Analytics</p><h2>Team performance snapshot</h2></div><ShieldCheck size={20} /></div>
          <div className="metric-card-list">
            {dashboard.mentorAnalytics.map((item) => (
              <div key={item.mentor} className="metric-card">
                <strong>{item.mentor}</strong>
                <span>{item.internCount} interns</span>
                <span>{item.avgAttendance}% avg attendance</span>
                <span>{item.avgPerformance}/100 avg performance</span>
              </div>
            ))}
          </div>
        </motion.article>
        <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel-header"><div><p className="panel-kicker">Calendar & Timeline</p><h2>Upcoming reviews and deadlines</h2></div><CalendarRange size={20} /></div>
          <div className="timeline-list">
            {dashboard.calendarEvents.map((item) => (
              <div key={item.id} className="timeline-item">
                <strong>{item.label}</strong>
                <span>{formatDate(item.date)}</span>
                <span>{item.type}</span>
              </div>
            ))}
          </div>
        </motion.article>
      </section>
    </>
  );

  const renderInterns = () => (
    <section className="dashboard-grid single-column">
      <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className="panel-header">
          <div><p className="panel-kicker">Intern Management & Onboarding</p><h2>Track, edit, and onboard intern profiles</h2></div>
          <div className="panel-actions">
            {sectionFocus === 'pending-approvals' ? <button type="button" className="ghost-button" onClick={clearSectionFocus}>Show all interns</button> : null}
            <button type="button" className="secondary-button" onClick={openBroadcastComposer}><Send size={16} />Broadcast</button>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} className="primary-button" onClick={openAddIntern}><Plus size={16} />Add Intern</motion.button>
          </div>
        </div>
        <div className="filter-row">
          <select value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}>{domainOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={mentorFilter} onChange={(event) => setMentorFilter(event.target.value)}>{mentorOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={batchFilter} onChange={(event) => setBatchFilter(event.target.value)}>{batchOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
        <div className="intern-card-grid">
          {filteredInterns.map((intern) => (
            <motion.article key={intern.id} className="intern-profile-card" whileHover={{ y: -8, rotateX: 4, rotateY: -4 }}>
              <div className="intern-card-top">
                <div>
                  <strong>{intern.name}</strong>
                  <span>{intern.email}</span>
                </div>
                <span className={`status-pill ${intern.status.toLowerCase().replace(/\s+/g, '-')}`}>{intern.status}</span>
              </div>
              <div className="intern-card-meta">
                <span>Domain: {intern.domain}</span>
                <span>Mentor: {intern.mentor}</span>
                <span>Onboarding: {formatDate(intern.startDate)} to {formatDate(intern.endDate)}</span>
              </div>
              <div className="intern-chip-row">
                <span className="settings-chip">{intern.batch}</span>
                <span className="settings-chip">{intern.college || 'College not set'}</span>
                {(intern.badges || []).slice(0, 2).map((badge) => <span key={badge} className="settings-chip">{badge}</span>)}
              </div>
              <div className="intern-card-progress">
                <div className="chart-labels"><span>Tasks</span><strong>{intern.completedTasks}/{intern.totalTasks}</strong></div>
                <div className="mini-progress"><motion.span initial={{ width: 0 }} animate={{ width: `${intern.taskCompletionRate || 0}%` }} transition={{ duration: 0.8 }} /></div>
              </div>
              <div className="intern-card-progress">
                <div className="chart-labels"><span>Attendance</span><strong>{intern.attendanceRate}%</strong></div>
                <div className="mini-progress attendance-progress"><motion.span initial={{ width: 0 }} animate={{ width: `${intern.attendanceRate}%` }} transition={{ duration: 0.8 }} /></div>
              </div>
              <div className="intern-card-progress">
                <div className="chart-labels"><span>Profile completion</span><strong>{intern.profileCompletion || 0}%</strong></div>
                <div className="mini-progress"><motion.span initial={{ width: 0 }} animate={{ width: `${intern.profileCompletion || 0}%` }} transition={{ duration: 0.8 }} /></div>
              </div>
              <div className="table-action-row">
                <button className="table-action" type="button" onClick={() => openInternDetail(intern)}>View</button>
                <button className="table-action" type="button" onClick={() => openEditIntern(intern)}><Pencil size={14} />Edit</button>
                <button className="table-action" type="button" onClick={() => openMessageComposer(intern)}><Mail size={14} />Send Mail</button>
                <button className="table-action" type="button" onClick={() => handleArchiveToggle(intern)}>{intern.status === 'Archived' ? 'Restore' : 'Archive'}</button>
              </div>
            </motion.article>
          ))}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Intern</th><th>Domain</th><th>Mentor</th><th>Attendance</th><th>Tasks</th><th>Timeline</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {filteredInterns.map((intern) => (
                <tr key={intern.id}>
                  <td><strong>{intern.name}</strong><span>{intern.email}</span></td>
                  <td>{intern.domain}</td>
                  <td>{intern.mentor}</td>
                  <td>{intern.attendanceRate}%</td>
                  <td>{intern.completedTasks}/{intern.totalTasks}<span>{(intern.badges || []).join(', ') || 'No badges'}</span></td>
                  <td><span>{formatDate(intern.startDate)}</span><span>{formatDate(intern.endDate)}</span><span>{intern.profileCompletion || 0}% profile</span></td>
                  <td><span className={`status-pill ${intern.status.toLowerCase().replace(/\s+/g, '-')}`}>{intern.status}</span></td>
                  <td>
                    <div className="table-action-row">
                      <button className="table-action" type="button" onClick={() => openInternDetail(intern)}>View</button>
                      <button className="table-action" type="button" onClick={() => openEditIntern(intern)}><Pencil size={14} />Edit</button>
                      <button className="table-action" type="button" onClick={() => openMessageComposer(intern)}><Mail size={14} />Mail</button>
                      <button className="table-action" type="button" onClick={() => handleArchiveToggle(intern)}>{intern.status === 'Archived' ? 'Restore' : 'Archive'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.article>
    </section>
  );

  const renderTasks = () => (
    <section className="dashboard-grid">
      <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className="panel-header"><div><p className="panel-kicker">Project and Task Monitoring</p><h2>Create or assign a project</h2></div><NotebookPen size={20} /></div>
        {sectionFocus !== 'all' ? <div className="helper-note">Current view: {sectionFocus.replace(/-/g, ' ')} <button type="button" className="inline-link-button" onClick={clearSectionFocus}>Clear</button></div> : null}
        <form className="stack-form" onSubmit={handleTaskSubmit}>
          <label>
            Select project template
            <select value={taskForm.project_template} onChange={(event) => handleTemplateSelection(event.target.value)}>
              <option value="">Custom task</option>
              {dashboard.projectTemplates.map((template) => (
                <option key={template.id} value={template.id}>{template.title} | {template.domain}</option>
              ))}
            </select>
          </label>
          <div className="helper-note">Admins and mentors can pick a ready-made project template or type a completely custom task manually.</div>
          <label>
            Task title
            <input
              list="project-template-suggestions"
              value={taskForm.title}
              onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
              required
            />
            <datalist id="project-template-suggestions">
              {dashboard.projectTemplates.map((template) => (
                <option key={template.id} value={template.title} />
              ))}
            </datalist>
          </label>
          <label>Description<textarea value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} required /></label>
          <label>Assign to<select value={taskForm.assigned_to} onChange={(event) => setTaskForm((current) => ({ ...current, assigned_to: event.target.value }))} required>{dashboard.interns.map((intern) => <option key={intern.id} value={intern.id}>{intern.name}</option>)}</select></label>
          <label>Priority<select value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))}><option>Low</option><option>Medium</option><option>High</option></select></label>
          <label>Start date<input type="date" value={taskForm.start_date} onChange={(event) => setTaskForm((current) => ({ ...current, start_date: event.target.value }))} required /></label>
          <label>Deadline<input type="date" value={taskForm.deadline} onChange={(event) => setTaskForm((current) => ({ ...current, deadline: event.target.value }))} required /></label>
          <label>Deliverable<input value={taskForm.deliverable} onChange={(event) => setTaskForm((current) => ({ ...current, deliverable: event.target.value }))} /></label>
          <div className="helper-note">Automatic email updates are sent on task assignment, behind-schedule progress, due-today reminders, overdue deadlines, and absent attendance records.</div>
          <div className="template-pills">
            {dashboard.projectTemplates.map((template) => (
              <button key={template.id} type="button" className={taskForm.project_template === template.id ? 'template-pill active' : 'template-pill'} onClick={() => handleTemplateSelection(template.id)}>
                {template.title}
              </button>
            ))}
          </div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="primary-button auth-submit" type="submit" disabled={isTaskSubmitting}>{isTaskSubmitting ? 'Assigning...' : 'Assign Project'}</motion.button>
        </form>
      </motion.article>
      <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className="panel-header"><div><p className="panel-kicker">Project Board</p><h2>Manage project progress</h2></div><FolderKanban size={20} /></div>
        <div className="task-board">
          {filteredTasks.map((task) => {
            const assignee = dashboard.interns.find((intern) => intern.id === task.assigned_to);
            return (
              <motion.div key={task.id} className="task-card" whileHover={{ y: -6 }}>
                <div className="task-card-top">
                  <div><strong>{task.title}</strong><span>{assignee?.name || 'Unassigned'} | {task.priority}</span></div>
                  <span className={`status-pill ${task.status.toLowerCase().replace(/\s+/g, '-')}`}>{task.status}</span>
                </div>
                <p>{task.description}</p>
                <div className="task-meta"><span>Start: {formatDate(task.start_date)}</span><span>Deadline: {formatDate(task.deadline)}</span><span>Progress: {task.progress}%</span></div>
                <div className="mini-progress"><motion.span initial={{ width: 0 }} animate={{ width: `${task.progress}%` }} transition={{ duration: 0.8 }} /></div>
                {task.latest_update_note ? (
                  <div className="helper-note task-update-note">
                    Latest intern update by <strong>{task.latest_updated_by || assignee?.name || 'Intern'}</strong>:
                    <span>{task.latest_update_note}</span>
                    <small>{task.latest_update_at ? relativeTime(task.latest_update_at) : 'Just now'}</small>
                  </div>
                ) : null}
                {task.submission?.submitted_at ? (
                  <div className="proof-panel">
                    <strong>Submitted proof</strong>
                    <span>Review status: {task.submission.review_status || 'Pending'}</span>
                    {task.submission.github_link ? <a href={task.submission.github_link} target="_blank" rel="noreferrer">Open GitHub link</a> : null}
                    {task.submission.deployed_link ? <a href={task.submission.deployed_link} target="_blank" rel="noreferrer">Open deployed link</a> : null}
                    {task.submission.report_file?.data_url ? <button className="table-action" type="button" onClick={() => downloadDataUrl(task.submission.report_file.data_url, task.submission.report_file.file_name)}>Download report</button> : null}
                    {task.submission.screenshot_file?.data_url ? <button className="table-action" type="button" onClick={() => downloadDataUrl(task.submission.screenshot_file.data_url, task.submission.screenshot_file.file_name)}>Download screenshot</button> : null}
                    {task.submission.note ? <div className="helper-note compact-note">{task.submission.note}</div> : null}
                    <div className="table-action-row">
                      <button className="table-action" type="button" onClick={() => handleSubmissionReview(task.id, 'Approved')}>Approve Proof</button>
                      <button className="table-action" type="button" onClick={() => handleSubmissionReview(task.id, 'Rejected')}>Reject Proof</button>
                    </div>
                  </div>
                ) : null}
                <div className="table-action-row">
                  <button className="secondary-button" type="button" onClick={() => handleTaskStatusUpdate(task.id, task.status, task.progress)}>
                    {task.status === 'Completed' ? 'Move To In Progress' : 'Mark Completed'}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.article>
    </section>
  );

  const renderAttendance = () => (
    <>
      <section className="dashboard-grid single-column">
        <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel-header"><div><p className="panel-kicker">Attendance Tracking</p><h2>Mark intern attendance</h2></div><CalendarRange size={20} /></div>
          <form className="stack-form compact-form" onSubmit={handleAttendanceSubmit}>
            <label>Date<input type="date" value={attendanceForm.date} onChange={(event) => setAttendanceForm((current) => ({ ...current, date: event.target.value }))} required /></label>
            <div className="attendance-roster">
              {dashboard.interns.map((intern) => (
                <div key={intern.id} className="attendance-row-card">
                  <div className="attendance-row-copy">
                    <strong>{intern.name}</strong>
                    <span>{intern.domain} • {intern.status}</span>
                  </div>
                  <div className="attendance-toggle-group">
                    {['Present', 'Absent', 'Leave'].map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`attendance-toggle ${status.toLowerCase()} ${attendanceForm.records?.[intern.id] === status ? 'active' : ''}`}
                        onClick={() => setAttendanceForm((current) => ({
                          ...current,
                          records: { ...current.records, [intern.id]: status },
                        }))}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="primary-button auth-submit" type="submit" disabled={isAttendanceSubmitting}>{isAttendanceSubmitting ? 'Saving...' : 'Submit Attendance'}</motion.button>
          </form>
          <div className="helper-note">Whenever admin marks attendance, the selected intern now receives an immediate attendance status email update.</div>
          <div className="evaluation-grid">
            {filteredPerformance.map((item) => (
              <motion.div key={item.internId} className="evaluation-card" whileHover={{ y: -5 }}>
                <div className="evaluation-head">
                  <strong>{item.name}</strong>
                  <span className={`performance-band ${item.band.toLowerCase()}`}>{item.band}</span>
                </div>
                <div className="metric-chip-row">
                  <span>Score: {item.score}</span>
                  <span>Attendance: {item.attendanceRate}%</span>
                  <span>Tasks: {item.taskCompletionRate}%</span>
                </div>
                {dashboard.evaluations.find((entry) => entry.intern_id === item.internId) ? (
                  <div className="helper-note compact-note">
                    <span>Evaluation: {dashboard.evaluations.find((entry) => entry.intern_id === item.internId).overall_score}/100</span>
                    <span>{dashboard.evaluations.find((entry) => entry.intern_id === item.internId).comments}</span>
                  </div>
                ) : null}
                <div className="mini-progress"><motion.span initial={{ width: 0 }} animate={{ width: `${item.score}%` }} transition={{ duration: 0.8 }} /></div>
              </motion.div>
            ))}
          </div>
        </motion.article>
      </section>
        <section className="dashboard-grid single-column">
          <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
            <div className="panel-header"><div><p className="panel-kicker">Performance Review</p><h2>Open the dedicated review center</h2></div><Star size={20} /></div>
            {sectionFocus === 'upcoming-evaluations' ? <div className="helper-note">This view highlights interns who need evaluation attention soon.</div> : null}
            <div className="review-launch-card">
              <div className="review-launch-copy">
                <strong>Review Center</strong>
              </div>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="secondary-button auth-submit" type="button" onClick={() => setShowEvaluationModal(true)}>Open Review Form</motion.button>
            </div>
          </motion.article>
        </section>
        <section className="dashboard-grid">
        <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel-header"><div><p className="panel-kicker">Attendance Heatmap & Certificates</p><h2>Monitor consistency and readiness</h2></div><CheckCircle2 size={20} /></div>
          <div className="heatmap-wrap">
            <div className="heatmap-dates" style={heatmapGridStyle}><span>Intern</span>{dashboard.attendanceHeatmap.dates.map((item) => <span key={item}>{new Date(item).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>)}</div>
            {dashboard.attendanceHeatmap.rows.map((row) => (
              <div key={row.internName} className="heatmap-row" style={heatmapGridStyle}>
                <span className="heatmap-name">{row.internName}</span>
                {row.values.map((cell) => <span key={`${row.internName}-${cell.date}`} className={`heatmap-cell ${cell.status.toLowerCase()}`} title={`${row.internName} - ${cell.status} on ${formatDate(cell.date)}`} />)}
              </div>
            ))}
          </div>
          <div className="certificate-list">
            {dashboard.certifications.map((item) => (
              <div key={item.internId} className="certificate-card">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.completedTasks}/{item.totalTasks} tasks, {item.attendanceRate}% attendance</span>
                </div>
                <div className="certificate-actions">
                  <span className={`certificate-status ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>{item.status}</span>
                  <button className="secondary-button" type="button" disabled={!item.canDownload || downloadingCertificateId === item.internId} onClick={() => handleCertificateDownload(item)}>
                    {downloadingCertificateId === item.internId ? 'Generating...' : item.canDownload ? 'Download Certificate' : 'Not Ready'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mail-audit-card top-gap">
            <h3>Leave Requests</h3>
            {dashboard.leaveRequests?.length ? dashboard.leaveRequests.map((request) => (
              <div key={request.id} className="mail-audit-item">
                <strong>{request.internName}</strong>
                <span>{formatDate(request.start_date)} to {formatDate(request.end_date)} | {request.reason}</span>
                <span>Status: {request.status}</span>
                {request.status === 'Pending' ? <div className="table-action-row"><button className="table-action" type="button" onClick={() => handleLeaveRequestReview(request.id, 'Approved')}>Approve</button><button className="table-action" type="button" onClick={() => handleLeaveRequestReview(request.id, 'Rejected')}>Reject</button></div> : null}
              </div>
            )) : <p className="muted-copy">No leave requests yet.</p>}
          </div>
        </motion.article>
      </section>
    </>
  );

  const renderCertificates = () => (
    <section className="dashboard-grid">
      <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className="panel-header"><div><p className="panel-kicker">Certificates Dashboard</p><h2>Readiness, downloads, and completion pipeline</h2></div><CheckCircle2 size={20} /></div>
        <section className="stats-grid certificate-stats-grid">
          <div className="stat-card tone-success">
            <div className="stat-label">Ready to Download</div>
            <div className="stat-value"><AnimatedCounter value={dashboard.certificateSummary.readyCount} /></div>
            <p>Interns who currently satisfy all certificate rules.</p>
          </div>
          <div className="stat-card tone-warning">
            <div className="stat-label">In Review</div>
            <div className="stat-value"><AnimatedCounter value={dashboard.certificateSummary.inReviewCount} /></div>
            <p>Interns who still need attendance, tasks, or time-cycle completion.</p>
          </div>
          <div className="stat-card tone-neutral">
            <div className="stat-label">Eligible Soon</div>
            <div className="stat-value"><AnimatedCounter value={dashboard.certificateSummary.eligibleSoonCount} /></div>
            <p>Interns who are close to certificate readiness.</p>
          </div>
        </section>
        <div className="certificate-dashboard-list">
          {dashboard.certifications.map((item) => (
            <div key={item.internId} className="certificate-dashboard-card">
              <div className="certificate-dashboard-top">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.completedTasks}/{item.totalTasks} tasks completed • {item.attendanceRate}% attendance • {item.certificateId}</span>
                </div>
                <span className={`certificate-status ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>{item.status}</span>
              </div>
              <div className="criteria-list">
                {item.criteria.map((criterion) => (
                  <div key={`${item.internId}-${criterion.label}`} className={criterion.met ? 'criteria-item met' : 'criteria-item'}>
                    <span>{criterion.label}</span>
                    <strong>{criterion.met ? 'Met' : 'Pending'}</strong>
                  </div>
                ))}
              </div>
              <div className="panel-actions">
                <button className="secondary-button" type="button" disabled={!item.canDownload || downloadingCertificateId === item.internId} onClick={() => handleCertificateDownload(item)}>
                  {downloadingCertificateId === item.internId ? 'Generating...' : item.canDownload ? 'Download Certificate' : 'Not Ready'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.article>
      <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className="panel-header"><div><p className="panel-kicker">Performance Badges</p><h2>Badges awarded automatically from overall performance</h2></div><Award size={20} /></div>
        <div className="badge-catalog-grid">
          {dashboard.badgeCatalog.map((badge) => (
            <div key={badge.id} className="badge-catalog-card">
              <strong>{badge.label}</strong>
              <span>{badge.description}</span>
            </div>
          ))}
        </div>
        <div className="metric-card-list top-gap">
          {(dashboard.badgeInsights?.length ? dashboard.badgeInsights : [{ label: 'No earned badges yet', count: 0 }]).map((item) => (
            <div key={item.label} className="metric-card">
              <strong>{item.label}</strong>
              <span>{item.count} earned</span>
            </div>
          ))}
        </div>
        <div className="certificate-dashboard-list top-gap">
          {dashboard.interns.map((intern) => (
            <div key={intern.id} className="certificate-dashboard-card">
              <div className="certificate-dashboard-top">
                <div>
                  <strong>{intern.name}</strong>
                  <span>{intern.domain} | {intern.performanceScore}/100 | {intern.attendanceRate}% attendance</span>
                </div>
                <span className={`performance-band ${((intern.performanceScore >= 85 && 'excellent') || (intern.performanceScore >= 70 && 'strong') || (intern.performanceScore >= 55 && 'watch') || 'critical')}`}>{intern.performanceScore >= 85 ? 'Elite' : intern.performanceScore >= 70 ? 'Strong' : intern.performanceScore >= 55 ? 'Watch' : 'Critical'}</span>
              </div>
              <div className="badge-pill-row">
                {(intern.badges || []).length ? intern.badges.map((badge) => <span key={`${intern.id}-${badge}`} className="settings-chip">{badge}</span>) : <span className="muted-copy">No earned badges yet.</span>}
              </div>
              <div className="helper-note">These badges are provided automatically based on overall performance score, attendance consistency, and task completion.</div>
            </div>
          ))}
        </div>
      </motion.article>
      <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className="panel-header"><div><p className="panel-kicker">Certificate Verification</p><h2>Verify any certificate using its unique ID</h2></div><ShieldCheck size={20} /></div>
        <form className="stack-form compact-form" onSubmit={handleCertificateVerification}>
          <label>Certificate ID<input value={certificateLookupId} onChange={(event) => setCertificateLookupId(event.target.value)} placeholder="ITS-XXXXXXXXXX" required /></label>
          <button type="submit" className="primary-button">Verify Certificate</button>
        </form>
        {certificateLookupResult ? (
          <div className="helper-note top-gap">
            <strong>{certificateLookupResult.valid ? 'Valid certificate' : 'Certificate found'}</strong>
            <span>{certificateLookupResult.internName} | {certificateLookupResult.domain}</span>
            <span>Mentor: {certificateLookupResult.mentor}</span>
            <span>Cycle: {certificateLookupResult.issuedForCycle}</span>
          </div>
        ) : null}
      </motion.article>
    </section>
  );

  const renderInternPortal = () => (
    <div className="workspace-shell">
      <aside className="sidebar-shell intern-sidebar-shell">
        <button type="button" className="sidebar-profile-card intern-profile-card-shell" onClick={() => setInternSection('profile')}>
          <div className="sidebar-profile-top">
            {internDashboard.profile.profile_photo ? <img className="profile-photo-preview" src={internDashboard.profile.profile_photo} alt={internDashboard.profile.name} /> : <span className="admin-avatar">{internDashboard.profile.name?.slice(0, 2).toUpperCase()}</span>}
            <div>
              <p className="eyebrow">Intern Portal</p>
              <h2 className="sidebar-title">{internDashboard.profile.name}</h2>
              <p className="sidebar-copy">{internDashboard.profile.domain}</p>
            </div>
          </div>
        </button>
        <button type="button" className="sidebar-utility-button sidebar-utility-profile" onClick={() => setShowInternNotifications((current) => !current)}>
          <span className="sidebar-utility-left"><Bell size={16} />Notifications</span>
          {internNotificationItems.length ? <span className="sidebar-utility-badge">{internNotificationItems.length}</span> : null}
        </button>
        <nav className="sidebar-nav">
          {internSections.map((section) => {
            const Icon = section.icon;
            return <button key={section.id} type="button" className={internSection === section.id ? 'nav-item active' : 'nav-item'} onClick={() => setInternSection(section.id)}><Icon size={18} />{section.label}</button>;
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="profile-chip"><Users size={16} /><span>Mentor: {internDashboard.profile.mentor}</span></div>
          <button className="ghost-button logout-button" type="button" onClick={handleLogout}><LogOut size={16} />Logout</button>
        </div>
      </aside>
      <main className="page-shell">
        <motion.div className="hero-panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div>
            <p className="eyebrow">Intern Workspace</p>
            <h1>Welcome back, {internDashboard.profile.name}</h1>
            <p className="hero-copy">Stay on top of your assigned work, attendance, announcements, and internship completion progress.</p>
          </div>
          <div className="hero-actions hero-topbar">
            <div className="profile-chip">
              <Bell size={16} />
              <span>{internNotificationItems.length} notifications</span>
            </div>
            <div className="profile-chip">
              <ShieldCheck size={16} />
              <span>{internDashboard.performance.band}</span>
            </div>
            <div className="profile-chip">
              <Mail size={16} />
              <span>{internDashboard.inbox.length} inbox updates</span>
            </div>
          </div>
        </motion.div>
        <AnimatePresence>
          {showInternNotifications ? (
            <motion.div className="notification-drawer" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <div className="notification-header">
                <strong>My Notifications</strong>
                <button type="button" className="ghost-button" onClick={() => setShowInternNotifications(false)}>Close</button>
              </div>
              <div className="activity-list">
                {internNotificationItems.length ? internNotificationItems.map((item) => (
                  <button key={item.id} type="button" className="activity-item notification-item-button" onClick={() => {
                    if (item.kind === 'task') setInternSection('tasks');
                    else if (item.kind === 'attendance') setInternSection('attendance');
                    else setInternSection('overview');
                    setShowInternNotifications(false);
                  }}>
                    <div className={`activity-dot activity-${item.kind}`} />
                    <div><p>{item.message}</p><span>{relativeTime(item.timestamp)}</span></div>
                  </button>
                )) : <p className="muted-copy">No notifications yet.</p>}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {internSection === 'overview' ? (
          <>
            <section className="stats-grid">
              {internDashboard.stats.map((item) => (
                <button type="button" key={item.label} className="stat-card card-button" onClick={() => handleInternStatNavigation(item.label)}>
                  <div className="stat-label">{item.label}</div>
                  <div className="stat-value"><AnimatedCounter value={item.value} />{item.suffix}</div>
                </button>
              ))}
            </section>
            <section className="dashboard-grid">
              <motion.article className="panel clickable-profile-panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} onClick={openInternProfileEditor} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openInternProfileEditor(); }}>
                <div className="panel-header"><div><p className="panel-kicker">My Profile</p><h2>Intern details</h2></div><Pencil size={20} /></div>
                <div className="detail-grid">
                  <div className="detail-card detail-card-wide intern-profile-summary">
                    {internDashboard.profile.profile_photo ? (
                      <img className="profile-photo-preview" src={internDashboard.profile.profile_photo} alt={internDashboard.profile.name} />
                    ) : (
                      <span className="profile-avatar">{internDashboard.profile.name?.slice(0, 2).toUpperCase()}</span>
                    )}
                    <div>
                      <strong>{internDashboard.profile.name}</strong>
                      <span>{internDashboard.profile.domain}</span>
                    </div>
                    <span className="inline-edit-link">Click to edit profile</span>
                  </div>
                  <div className="detail-card"><strong>Email</strong><span>{internDashboard.profile.email}</span></div>
                  <div className="detail-card"><strong>Phone</strong><span>{internDashboard.profile.phone || 'Not set'}</span></div>
                  <div className="detail-card"><strong>College</strong><span>{internDashboard.profile.college || 'Not set'}</span></div>
                  <div className="detail-card"><strong>Batch</strong><span>{internDashboard.profile.batch}</span></div>
                  <div className="detail-card"><strong>Profile completion</strong><span>{internDashboard.profile.profileCompletion || 0}%</span></div>
                  <div className="detail-card detail-card-wide"><strong>Skills</strong><span>{internDashboard.profile.skills.join(', ') || 'No skills added yet'}</span></div>
                  <div className="detail-card detail-card-wide"><strong>Badges</strong><span>{internDashboard.profile.badges?.join(', ') || 'No badges earned yet'}</span></div>
                  <div className="detail-card detail-card-wide"><strong>Documents</strong><span>{getDocumentEntries(internDashboard.profile.documentRecords).map((item) => item.label).join(', ') || 'No documents uploaded yet'}</span></div>
                </div>
                <div className="mini-progress top-gap"><motion.span initial={{ width: 0 }} animate={{ width: `${internDashboard.profile.profileCompletion || 0}%` }} transition={{ duration: 0.8 }} /></div>
              </motion.article>
              <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
                <div className="panel-header"><div><p className="panel-kicker">Performance</p><h2>Your current standing</h2></div><Award size={20} /></div>
                <div className="metric-card-list intern-standing-metrics">
                  <div className="metric-card"><strong>Band</strong><span>{internDashboard.performance.band}</span></div>
                  <div className="metric-card"><strong>Score</strong><span>{internDashboard.performance.score}/100</span></div>
                  <div className="metric-card"><strong>Attendance</strong><span>{internDashboard.attendance.rate}%</span></div>
                  <div className="metric-card"><strong>Task completion</strong><span>{internDashboard.performance.taskCompletionRate}%</span></div>
                </div>
              <div className="helper-note top-gap">
                  Performance score formula: <strong>45% Attendance + 55% Task Completion</strong>.
                  Band guide: <strong>Excellent</strong> (85-100), <strong>Strong</strong> (70-84), <strong>Watch</strong> (55-69), <strong>Critical</strong> (0-54).
                  Your current band <strong>{internDashboard.performance.band}</strong> means {internDashboard.performance.band === 'Watch' ? 'you are progressing but need stronger consistency to move into Strong.' : 'your current progress level in this cycle.'}
                </div>
                <div className="badge-pill-row top-gap">
                  {(internDashboard.badgeSummary?.earned || []).length ? internDashboard.badgeSummary.earned.map((badge) => <span key={badge} className="settings-chip">{badge}</span>) : <span className="muted-copy">Keep building consistency to unlock earned badges.</span>}
                </div>
                {internDashboard.performance.latestEvaluation ? (
                  <div className="helper-note top-gap">
                    Latest evaluation: <strong>{internDashboard.performance.latestEvaluation.overall_score}/100</strong>
                    <span>Communication {internDashboard.performance.latestEvaluation.communication}/10 | Technical {internDashboard.performance.latestEvaluation.technical_skill}/10 | Teamwork {internDashboard.performance.latestEvaluation.teamwork}/10 | Ownership {internDashboard.performance.latestEvaluation.ownership}/10</span>
                    <span>{internDashboard.performance.latestEvaluation.comments}</span>
                  </div>
                ) : null}
              </motion.article>
              <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
                <div className="panel-header"><div><p className="panel-kicker">Recent Activity</p><h2>Latest updates for you</h2></div><CalendarRange size={20} /></div>
                <div className="activity-list">
                  {internDashboard.recentActivity.map((item) => (
                    <div key={item.id} className="activity-item">
                      <div className={`activity-dot activity-${item.kind}`} />
                      <div><p>{item.message}</p><span>{relativeTime(item.timestamp)}</span></div>
                    </div>
                  ))}
                </div>
              </motion.article>
            </section>
          </>
        ) : null}
        {internSection === 'tasks' ? (
          <section className="dashboard-grid single-column">
            <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
              <div className="panel-header"><div><p className="panel-kicker">My Tasks</p><h2>Assigned work</h2></div><ClipboardList size={20} /></div>
              {internTaskFilter !== 'all' ? <div className="helper-note">Filtered view: {internTaskFilter} tasks <button type="button" className="inline-link-button" onClick={() => setInternTaskFilter('all')}>Show all</button></div> : null}
              <div className="task-board">
                {internVisibleTasks.map((task) => (
                  <div key={task.id} className="task-card">
                    <div className="task-card-top">
                      <div><strong>{task.title}</strong><span>{task.priority} priority</span></div>
                      <span className={`status-pill ${task.status.toLowerCase().replace(/\s+/g, '-')}`}>{task.status}</span>
                    </div>
                    <p>{task.description}</p>
                    <div className="task-meta"><span>Start: {formatDate(task.start_date)}</span><span>Deadline: {formatDate(task.deadline)}</span><span>Progress: {task.progress}%</span></div>
                    <div className="mini-progress"><motion.span initial={{ width: 0 }} animate={{ width: `${task.progress}%` }} transition={{ duration: 0.8 }} /></div>
                    {task.submission?.submitted_at ? (
                      <div className="helper-note compact-note">
                        Submission status: <strong>{task.submission.review_status || 'Pending'}</strong>
                        {task.submission.admin_feedback ? <span>{task.submission.admin_feedback}</span> : null}
                      </div>
                    ) : null}
                    <button className="secondary-button" type="button" onClick={() => openInternTaskUpdate(task)}>Update Mentor/Admin</button>
                  </div>
                ))}
              </div>
            </motion.article>
          </section>
        ) : null}
        {internSection === 'profile' ? (
          <section className="dashboard-grid single-column">
            <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
              <div className="panel-header"><div><p className="panel-kicker">My Profile</p><h2>Full profile and achievements</h2></div><Users size={20} /></div>
              <div className="detail-grid">
                <div className="detail-card detail-card-wide intern-profile-summary">
                  {internDashboard.profile.profile_photo ? (
                    <img className="profile-photo-preview" src={internDashboard.profile.profile_photo} alt={internDashboard.profile.name} />
                  ) : (
                    <span className="profile-avatar">{internDashboard.profile.name?.slice(0, 2).toUpperCase()}</span>
                  )}
                  <div>
                    <strong>{internDashboard.profile.name}</strong>
                    <span>{internDashboard.profile.domain}</span>
                  </div>
                  <button type="button" className="secondary-button" onClick={openInternProfileEditor}>Edit Profile</button>
                </div>
                <div className="detail-card"><strong>Email</strong><span>{internDashboard.profile.email}</span></div>
                <div className="detail-card"><strong>Phone</strong><span>{internDashboard.profile.phone || 'Not set'}</span></div>
                <div className="detail-card"><strong>College</strong><span>{internDashboard.profile.college || 'Not set'}</span></div>
                <div className="detail-card"><strong>Batch</strong><span>{internDashboard.profile.batch}</span></div>
                <div className="detail-card"><strong>Profile completion</strong><span>{internDashboard.profile.profileCompletion || 0}%</span></div>
                <div className="detail-card detail-card-wide"><strong>Skills</strong><span>{internDashboard.profile.skills.join(', ') || 'No skills added yet'}</span></div>
                <div className="detail-card detail-card-wide"><strong>Badges</strong><span>{internDashboard.profile.badges?.join(', ') || 'No badges earned yet'}</span></div>
                <div className="detail-card detail-card-wide"><strong>Documents</strong><span>{getDocumentEntries(internDashboard.profile.documentRecords).map((item) => item.label).join(', ') || 'No documents uploaded yet'}</span></div>
                <div className="detail-card"><strong>Mentor</strong><span>{internDashboard.profile.mentor}</span></div>
                <div className="detail-card"><strong>Duration</strong><span>{formatDate(internDashboard.profile.startDate)} to {formatDate(internDashboard.profile.endDate)}</span></div>
              </div>
              <div className="document-grid top-gap">
                {getDocumentEntries(internDashboard.profile.documentRecords).map((doc) => (
                  <div key={doc.key} className="document-tile">
                    <strong>{doc.label}</strong>
                    <span>{doc.file_name || 'No file uploaded yet'}</span>
                    {doc.data_url ? <button className="table-action" type="button" onClick={() => downloadDataUrl(doc.data_url, doc.file_name || `${doc.label}.file`)}>Download</button> : null}
                  </div>
                ))}
              </div>
            </motion.article>
          </section>
        ) : null}
        {internSection === 'attendance' ? (
          <section className="dashboard-grid">
            <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
              <div className="panel-header"><div><p className="panel-kicker">Attendance</p><h2>Your recent attendance</h2></div><CalendarRange size={20} /></div>
              <div className="timeline-list">
                {internDashboard.attendance.records.map((record) => (
                  <div key={record.id} className="timeline-item">
                    <strong>{formatDate(record.date)}</strong>
                    <span>{record.status}</span>
                  </div>
                  ))}
                </div>
                <div className="document-grid top-gap">
                  {internDashboard.attendance.records.slice(0, 14).map((record) => (
                    <div key={`calendar-${record.id}`} className="document-tile">
                      <strong>{formatDate(record.date)}</strong>
                      <span>{record.status}</span>
                    </div>
                  ))}
                </div>
              </motion.article>
            <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
              <div className="panel-header"><div><p className="panel-kicker">Leave Request</p><h2>Request time away and track approvals</h2></div><CalendarClock size={20} /></div>
              <form className="stack-form compact-form" onSubmit={handleLeaveRequestSubmit}>
                <label>Start date<input type="date" value={leaveRequestForm.start_date} onChange={(event) => setLeaveRequestForm((current) => ({ ...current, start_date: event.target.value }))} required /></label>
                <label>End date<input type="date" value={leaveRequestForm.end_date} onChange={(event) => setLeaveRequestForm((current) => ({ ...current, end_date: event.target.value }))} required /></label>
                <label className="detail-card-wide">Reason<textarea value={leaveRequestForm.reason} onChange={(event) => setLeaveRequestForm((current) => ({ ...current, reason: event.target.value }))} required /></label>
                <button type="submit" className="primary-button" disabled={isSubmittingLeaveRequest}>{isSubmittingLeaveRequest ? 'Sending...' : 'Request Leave'}</button>
              </form>
              <div className="mail-audit-card top-gap">
                {internDashboard.leaveRequests?.length ? internDashboard.leaveRequests.map((item) => (
                  <div key={item.id} className="mail-audit-item">
                    <strong>{formatDate(item.start_date)} to {formatDate(item.end_date)}</strong>
                    <span>{item.reason}</span>
                    <span>Status: {item.status}</span>
                  </div>
                )) : <p className="muted-copy">No leave requests yet.</p>}
              </div>
            </motion.article>
          </section>
        ) : null}
        {internSection === 'certificates' ? (
          <section className="dashboard-grid single-column">
            <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
              <div className="panel-header"><div><p className="panel-kicker">Certificates Dashboard</p><h2>Your completion status and downloads</h2></div><CheckCircle2 size={20} /></div>
              <section className="stats-grid certificate-stats-grid">
                <div className="stat-card tone-neutral">
                  <div className="stat-label">Certificate Status</div>
                  <div className="stat-value">{internDashboard.certificate.status}</div>
                  <p>{internDashboard.certificate.canDownload ? 'Your certificate is ready to download now.' : 'Complete the pending requirements to unlock your certificate.'}</p>
                </div>
                <div className="stat-card tone-success">
                  <div className="stat-label">Attendance</div>
                  <div className="stat-value">{internDashboard.attendance.rate}%</div>
                  <p>Attendance is part of certificate eligibility.</p>
                </div>
                <div className="stat-card tone-warning">
                  <div className="stat-label">Tasks Completed</div>
                  <div className="stat-value">{internDashboard.tasks.filter((task) => task.status === 'Completed').length}/{internDashboard.tasks.length}</div>
                  <p>All assigned tasks should be completed before certificate approval.</p>
                </div>
              </section>
              <div className="certificate-dashboard-list">
                <div className="certificate-dashboard-card">
                  <div className="certificate-dashboard-top">
                    <div>
                      <strong>{internDashboard.profile.name}</strong>
                      <span>{internDashboard.profile.domain} | {internDashboard.profile.mentor} | ID {internDashboard.certificate.certificateId}</span>
                    </div>
                    <span className={`certificate-status ${internDashboard.certificate.status.toLowerCase().replace(/\s+/g, '-')}`}>{internDashboard.certificate.status}</span>
                  </div>
                  <div className="criteria-list">
                    {internDashboard.certificate.criteria?.map((criterion) => (
                      <div key={criterion.label} className={criterion.met ? 'criteria-item met' : 'criteria-item'}>
                        <span>{criterion.label}</span>
                        <strong>{criterion.met ? 'Met' : 'Pending'}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="panel-actions">
                    <button className="secondary-button" type="button" disabled={!internDashboard.certificate.canDownload || downloadingCertificateId === internDashboard.profile.id} onClick={() => handleCertificateDownload({ internId: internDashboard.profile.id, name: internDashboard.profile.name })}>
                      {downloadingCertificateId === internDashboard.profile.id ? 'Generating...' : internDashboard.certificate.canDownload ? 'Download Certificate' : 'Not Ready'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.article>
          </section>
        ) : null}
        {internSection === 'inbox' ? (
          <section className="dashboard-grid single-column">
            <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
              <div className="panel-header"><div><p className="panel-kicker">Inbox</p><h2>Announcements and admin updates</h2></div><Mail size={20} /></div>
              <div className="activity-list">
                {internDashboard.inbox.length ? internDashboard.inbox.map((item) => (
                  <div key={item.id} className="activity-item">
                    <div className={`activity-dot activity-${item.kind}`} />
                    <div><p>{item.message}</p><span>{relativeTime(item.timestamp)}</span></div>
                  </div>
                )) : <p className="muted-copy">No inbox updates yet.</p>}
              </div>
            </motion.article>
          </section>
        ) : null}
        {internSection === 'settings' ? (
          <section className="dashboard-grid single-column">
            <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
              <div className="panel-header"><div><p className="panel-kicker">Account Settings</p><h2>Change your password</h2></div><Settings size={20} /></div>
              <form className="admin-profile-form" onSubmit={handleInternPasswordChange}>
                <label>Current password<input type="password" value={internPasswordForm.current_password} onChange={(event) => setInternPasswordForm((current) => ({ ...current, current_password: event.target.value }))} required /></label>
                <label>New password<input type="password" value={internPasswordForm.new_password} onChange={(event) => setInternPasswordForm((current) => ({ ...current, new_password: event.target.value }))} required /></label>
                <button type="submit" className="primary-button" disabled={isChangingInternPassword}>{isChangingInternPassword ? 'Updating...' : 'Update Password'}</button>
              </form>
            </motion.article>
          </section>
        ) : null}
        {showInternProfileModal ? (
          <div className="modal-backdrop" onClick={() => setShowInternProfileModal(false)}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="panel-header">
                <div><p className="panel-kicker">My Profile</p><h2>Edit intern details</h2></div>
                <button className="ghost-button" type="button" onClick={() => setShowInternProfileModal(false)}>Close</button>
              </div>
              <form className="intern-form" onSubmit={handleInternProfileSave}>
                <label>Name<input value={internProfileForm.name} onChange={(event) => setInternProfileForm((current) => ({ ...current, name: event.target.value }))} required /></label>
                <label>Email<input type="email" value={internProfileForm.email} onChange={(event) => setInternProfileForm((current) => ({ ...current, email: event.target.value }))} required /></label>
                <label>Phone<input value={internProfileForm.phone} onChange={(event) => setInternProfileForm((current) => ({ ...current, phone: event.target.value }))} /></label>
                <label>College<input value={internProfileForm.college} onChange={(event) => setInternProfileForm((current) => ({ ...current, college: event.target.value }))} /></label>
                <label>Batch<input value={internProfileForm.batch} onChange={(event) => setInternProfileForm((current) => ({ ...current, batch: event.target.value }))} /></label>
                <label>Domain<input value={internProfileForm.domain} onChange={(event) => setInternProfileForm((current) => ({ ...current, domain: event.target.value }))} required /></label>
                <label>Skills<input value={internProfileForm.skills} onChange={(event) => setInternProfileForm((current) => ({ ...current, skills: event.target.value }))} placeholder="React, FastAPI, Testing" /></label>
                <label>Profile photo<input type="file" accept="image/*" onChange={handleInternProfilePhotoUpload} /></label>
                {internProfileForm.profile_photo ? <img className="profile-photo-preview intern-profile-photo-large" src={internProfileForm.profile_photo} alt={internProfileForm.name || 'Intern profile'} /> : null}
                <button className="primary-button submit-button" type="submit" disabled={isSavingInternProfile}>{isSavingInternProfile ? 'Saving...' : 'Save Profile'}</button>
              </form>
            </div>
          </div>
        ) : null}
        {showInternTaskUpdateModal ? (
          <div className="modal-backdrop" onClick={() => setShowInternTaskUpdateModal(false)}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="panel-header">
                <div><p className="panel-kicker">Task Update</p><h2>Update mentor/admin on progress</h2></div>
                <button className="ghost-button" type="button" onClick={() => setShowInternTaskUpdateModal(false)}>Close</button>
              </div>
              <form className="intern-form" onSubmit={handleInternTaskUpdateSubmit}>
                <label>Progress ({internTaskUpdateForm.progress}%)
                  <input type="range" min="0" max="100" value={internTaskUpdateForm.progress} onChange={(event) => setInternTaskUpdateForm((current) => ({ ...current, progress: Number(event.target.value) }))} />
                </label>
                <label>Status<select value={internTaskUpdateForm.status} onChange={(event) => setInternTaskUpdateForm((current) => ({ ...current, status: event.target.value }))}><option>Pending</option><option>In Progress</option><option>Completed</option></select></label>
                <label>Update note<textarea className="message-textarea" value={internTaskUpdateForm.update_note} onChange={(event) => setInternTaskUpdateForm((current) => ({ ...current, update_note: event.target.value }))} placeholder="Describe what you completed and any blockers..." required /></label>
                <label>GitHub link<input value={internTaskUpdateForm.github_link} onChange={(event) => setInternTaskUpdateForm((current) => ({ ...current, github_link: event.target.value }))} placeholder="https://github.com/..." /></label>
                <label>Deployed link<input value={internTaskUpdateForm.deployed_link} onChange={(event) => setInternTaskUpdateForm((current) => ({ ...current, deployed_link: event.target.value }))} placeholder="https://..." /></label>
                <label>Proof note<textarea className="message-textarea" value={internTaskUpdateForm.proof_note} onChange={(event) => setInternTaskUpdateForm((current) => ({ ...current, proof_note: event.target.value }))} placeholder="Mention what is included in your proof submission..." /></label>
                <label>PDF or report upload<input type="file" accept=".pdf,.doc,.docx,.txt,.ppt,.pptx" onChange={(event) => handleTaskProofFileUpload('report_file', event.target.files?.[0])} /></label>
                <label>Screenshot upload<input type="file" accept="image/*" onChange={(event) => handleTaskProofFileUpload('screenshot_file', event.target.files?.[0])} /></label>
                {(internTaskUpdateForm.report_file || internTaskUpdateForm.screenshot_file) ? <div className="helper-note compact-note">{internTaskUpdateForm.report_file ? <span>Report: {internTaskUpdateForm.report_file.file_name}</span> : null}{internTaskUpdateForm.screenshot_file ? <span>Screenshot: {internTaskUpdateForm.screenshot_file.file_name}</span> : null}</div> : null}
                <button className="primary-button submit-button" type="submit" disabled={isSubmittingInternTaskUpdate}>{isSubmittingInternTaskUpdate ? 'Submitting...' : 'Send Update'}</button>
              </form>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
        case 'interns': return renderInterns();
        case 'projects': return renderTasks();
        case 'evaluations': return renderAttendance();
        case 'certificates': return renderCertificates();
        case 'settings':
        return (
          <section className="dashboard-grid settings-grid">
            <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
              <div className="panel-header"><div><p className="panel-kicker">Admin Profile</p><h2>Admin Control & System Configuration</h2></div><ShieldCheck size={20} /></div>
              <div className="settings-card">
                {adminSession.profile_photo ? <img className="profile-photo-preview" src={adminSession.profile_photo} alt={adminSession.name} /> : <div className="admin-avatar">{adminSession.name?.slice(0, 2).toUpperCase()}</div>}
                <div>
                  <h3>{adminSession.name}</h3>
                  <p>{adminSession.email}</p>
                  <span className="settings-chip">{adminSession.access_level || 'Administrator'}</span>
                </div>
              </div>
              <form className="admin-profile-form" onSubmit={handleAdminProfileSave}>
                <label>Name<input value={adminProfileForm.name} onChange={(event) => setAdminProfileForm((current) => ({ ...current, name: event.target.value }))} required /></label>
                <label>Email<input type="email" value={adminProfileForm.email} onChange={(event) => setAdminProfileForm((current) => ({ ...current, email: event.target.value }))} required /></label>
                <label>Role<input value={adminProfileForm.role} onChange={(event) => setAdminProfileForm((current) => ({ ...current, role: event.target.value }))} required /></label>
                <label>Phone<input value={adminProfileForm.phone} onChange={(event) => setAdminProfileForm((current) => ({ ...current, phone: event.target.value }))} required /></label>
                <label>Designation<input value={adminProfileForm.designation} onChange={(event) => setAdminProfileForm((current) => ({ ...current, designation: event.target.value }))} required /></label>
                <label>Organization<input value={adminProfileForm.organization} onChange={(event) => setAdminProfileForm((current) => ({ ...current, organization: event.target.value }))} required /></label>
                <label>Access level<select value={adminProfileForm.access_level} onChange={(event) => setAdminProfileForm((current) => ({ ...current, access_level: event.target.value }))}><option>Super Admin</option><option>Admin</option><option>Coordinator</option><option>Mentor</option></select></label>
                <label>Availability<select value={adminProfileForm.availability} onChange={(event) => setAdminProfileForm((current) => ({ ...current, availability: event.target.value }))}><option>Online</option><option>Busy</option><option>Away</option></select></label>
                <label>Profile photo<input type="file" accept="image/*" onChange={handleAdminProfilePhotoUpload} /></label>
                <div className="settings-toggle-grid">
                  {Object.entries(adminProfileForm.notification_preferences || {}).filter(([key]) => key !== 'email_frequency').map(([key, value]) => (
                    <label key={key} className="settings-toggle">
                      <input type="checkbox" checked={Boolean(value)} onChange={(event) => setAdminProfileForm((current) => ({ ...current, notification_preferences: { ...current.notification_preferences, [key]: event.target.checked } }))} />
                      <span>{key.replace(/_/g, ' ')}</span>
                    </label>
                  ))}
                </div>
                <label>Email frequency<select value={adminProfileForm.notification_preferences?.email_frequency || 'Immediate'} onChange={(event) => setAdminProfileForm((current) => ({ ...current, notification_preferences: { ...current.notification_preferences, email_frequency: event.target.value } }))}><option>Immediate</option><option>Daily</option><option>Weekly</option></select></label>
                <button type="submit" className="primary-button">Save Admin Settings</button>
              </form>
              <div className="settings-list">
                {['Intern Management & Onboarding', 'Project and Task Monitoring', 'Performance & Evaluation', 'Admin Control & System Configuration', 'Communication & Notifications'].map((item) => <div key={item} className="settings-list-item">{item}</div>)}
                <div className="settings-list-item">Last login: <strong>{adminSession.last_login ? formatDate(adminSession.last_login) : 'First session'}</strong></div>
                <div className="settings-list-item">Email frequency: <strong>{adminSession.notification_preferences?.email_frequency || 'Immediate'}</strong></div>
              </div>
              <div className="mail-audit-card">
                <h3>Login Activity</h3>
                {adminSession.login_activity?.length ? adminSession.login_activity.map((item, index) => (
                  <div key={`${item.timestamp}-${index}`} className="mail-audit-item">
                    <strong>{item.email}</strong>
                    <span>{relativeTime(item.timestamp)}</span>
                  </div>
                )) : <p className="muted-copy">No login activity available yet.</p>}
              </div>
              <form className="admin-profile-form top-gap" onSubmit={handleAdminPasswordChange}>
                <label>Current password<input type="password" value={adminPasswordForm.current_password} onChange={(event) => setAdminPasswordForm((current) => ({ ...current, current_password: event.target.value }))} required /></label>
                <label>New password<input type="password" value={adminPasswordForm.new_password} onChange={(event) => setAdminPasswordForm((current) => ({ ...current, new_password: event.target.value }))} required /></label>
                <button type="submit" className="primary-button" disabled={isChangingAdminPassword}>{isChangingAdminPassword ? 'Updating...' : 'Change Admin Password'}</button>
              </form>
            </motion.article>
            <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
              <div className="panel-header"><div><p className="panel-kicker">Notifications</p><h2>Delivery status</h2></div><Mail size={20} /></div>
              <div className="settings-list">
                <div className="settings-list-item">Email updates: <strong>{dashboard.notificationSummary.smtpConfigured ? 'Sending directly to inboxes' : 'Saved in outbox'}</strong></div>
                <div className="settings-list-item">Pending email updates: <strong>{dashboard.notificationSummary.queuedEmails}</strong></div>
                <div className="settings-list-item">Check every: <strong>{dashboard.notificationSummary.pollSeconds}s</strong></div>
                <div className="settings-list-item">Session: <strong>Login page appears after the app is fully closed</strong></div>
              </div>
              <div className="mail-audit-grid">
                <div className="mail-audit-card">
                  <h3>Queued or unsent updates</h3>
                  {dashboard.notificationAudit?.queuedItems?.length ? dashboard.notificationAudit.queuedItems.map((item) => (
                    <div key={item.id} className="mail-audit-item">
                      <strong>{item.subject}</strong>
                      <span>To: {item.to}</span>
                      <span>Status: {item.status}</span>
                      <span>{relativeTime(item.timestamp)}</span>
                      {item.error ? <span>Error: {item.error}</span> : null}
                    </div>
                  )) : <p className="muted-copy">No queued emails right now.</p>}
                </div>
                <div className="mail-audit-card">
                  <h3>Recent mail activity</h3>
                  {dashboard.notificationAudit?.recentActivity?.length ? dashboard.notificationAudit.recentActivity.map((item) => (
                    <div key={item.id} className="mail-audit-item">
                      <strong>{item.status}</strong>
                      <span>{item.message}</span>
                      <span>{relativeTime(item.timestamp)}</span>
                    </div>
                  )) : <p className="muted-copy">No email activity available yet.</p>}
                </div>
              </div>
              <div className="panel-actions top-gap">
                <button type="button" className="secondary-button" onClick={openBroadcastComposer}><Send size={16} />Send Announcement</button>
                <button type="button" className="secondary-button" onClick={handleReportDownload}><Download size={16} />{isDownloadingReport ? 'Preparing...' : 'Export CSV'}</button>
              </div>
            </motion.article>
            <motion.article className="panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
              <div className="panel-header"><div><p className="panel-kicker">Audit Log</p><h2>Recent system activity history</h2></div><ClipboardList size={20} /></div>
              <div className="mail-audit-card">
                {dashboard.auditLogs?.length ? dashboard.auditLogs.map((item) => (
                  <div key={item.id} className="mail-audit-item">
                    <strong>{item.entity} - {item.action}</strong>
                    <span>{item.message}</span>
                    <span>{relativeTime(item.timestamp)}</span>
                  </div>
                )) : <p className="muted-copy">No audit entries yet.</p>}
              </div>
            </motion.article>
          </section>
        );
      default: return renderOverview();
    }
  };

  if (!adminSession) {
    return (
      <AuthScreen
        accessMode={accessMode}
        authMode={authMode}
        loginForm={loginForm}
        registerForm={registerForm}
        onLoginChange={(event) => setLoginForm((current) => ({ ...current, [event.target.name]: event.target.value }))}
        onRegisterChange={(event) => setRegisterForm((current) => ({ ...current, [event.target.name]: event.target.value }))}
        onLogin={handleLogin}
        onRegister={handleRegister}
        setAuthMode={setAuthMode}
        setAccessMode={setAccessMode}
        authLoading={authLoading}
        error={error}
      />
    );
  }

  if (loading || (!dashboard && !internDashboard)) {
    return <div className="page-shell loading-state"><div className="skeleton-shell"><div className="skeleton-orbit" /><div className="skeleton-card skeleton-wide" /><div className="skeleton-grid"><div className="skeleton-card" /><div className="skeleton-card" /><div className="skeleton-card" /></div></div></div>;
  }

  if (adminSession.role_type === 'intern' && internDashboard) {
    return (
      <div className="page-shell">
        {error ? <div className="inline-error">{error}</div> : null}
        <AnimatePresence>
          {successMessage ? (
            <motion.div className="inline-success success-banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <CheckCircle2 size={16} />
              <span>{successMessage}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {renderInternPortal()}
      </div>
    );
  }

  return (
    <div className="workspace-shell">
      <aside className="sidebar-shell">
        <button type="button" className="sidebar-profile-card" onClick={() => setShowAdminProfile((current) => !current)}>
          <div className="sidebar-profile-top">
            <span className="admin-avatar">{adminSession.name?.slice(0, 2).toUpperCase()}</span>
            <div>
              <p className="eyebrow">Admin Console</p>
              <h2 className="sidebar-title">Intern Tracker</h2>
              <p className="sidebar-copy">Logged in as {adminSession.name}</p>
            </div>
          </div>
          <span className="sidebar-profile-link">Open profile</span>
        </button>
        <button type="button" className="sidebar-utility-button sidebar-utility-profile" onClick={() => setShowNotifications((current) => !current)}>
          <span className="sidebar-utility-left"><Bell size={16} />Notifications</span>
          {notificationCount ? <span className="sidebar-utility-badge">{notificationCount}</span> : null}
        </button>
        <nav className="sidebar-nav">
          {sections.map((section) => {
            const Icon = section.icon;
            return <button key={section.id} type="button" className={activeSection === section.id ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveSection(section.id); setSectionFocus('all'); }}><Icon size={18} />{section.label}</button>;
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="default-credentials compact"><ShieldCheck size={16} /><span>Default admin: admin@interntrack.com / admin123</span></div>
          <button className="ghost-button logout-button" type="button" onClick={handleLogout}><LogOut size={16} />Logout</button>
        </div>
      </aside>
      <main className="page-shell">
        <motion.div className="hero-panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <div>
            <p className="eyebrow">Intern Tracking System</p>
            <h1>Manage interns, projects, evaluations, notifications, and system settings from one place.</h1>
            <p className="hero-copy">Track progress, respond to alerts quickly, and move between sections from the shortcut cards below.</p>
          </div>
          <div className="hero-actions hero-topbar">
            <label className="search-shell">
              <Search size={16} />
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search interns, projects, evaluations..." />
            </label>
            {activeSection === 'interns' ? <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} className="primary-button" onClick={openAddIntern}><Plus size={18} />Add Intern</motion.button> : null}
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="secondary-button" onClick={openBroadcastComposer}><Send size={16} />Announcement</motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="secondary-button" onClick={handleReportDownload}><Download size={16} />{isDownloadingReport ? 'Preparing...' : 'Export Report'}</motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="secondary-button" onClick={loadDashboard}>Refresh Data</motion.button>
          </div>
        </motion.div>
        <AnimatePresence>
          {showAdminProfile ? (
            <motion.div className="admin-profile-panel" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <div className="admin-profile-header">
                <div className="admin-profile-identity">
                  <span className="admin-avatar">{adminSession.name?.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{adminSession.name}</strong>
                    <span>{adminSession.email}</span>
                  </div>
                </div>
                <div className="admin-profile-actions">
                  <button type="button" className="secondary-button" onClick={() => setIsEditingAdminProfile((current) => !current)}>{isEditingAdminProfile ? 'Cancel Edit' : 'Edit Profile'}</button>
                  <button type="button" className="ghost-button" onClick={() => setShowAdminProfile(false)}>Close</button>
                </div>
              </div>
              {isEditingAdminProfile ? (
                <form className="admin-profile-form" onSubmit={handleAdminProfileSave}>
                  <label>Name<input value={adminProfileForm.name} onChange={(event) => setAdminProfileForm((current) => ({ ...current, name: event.target.value }))} required /></label>
                  <label>Email<input type="email" value={adminProfileForm.email} onChange={(event) => setAdminProfileForm((current) => ({ ...current, email: event.target.value }))} required /></label>
                  <label>Role<input value={adminProfileForm.role} onChange={(event) => setAdminProfileForm((current) => ({ ...current, role: event.target.value }))} required /></label>
                  <label>Phone<input value={adminProfileForm.phone} onChange={(event) => setAdminProfileForm((current) => ({ ...current, phone: event.target.value }))} required /></label>
                  <label>Designation<input value={adminProfileForm.designation} onChange={(event) => setAdminProfileForm((current) => ({ ...current, designation: event.target.value }))} required /></label>
                  <label>Organization<input value={adminProfileForm.organization} onChange={(event) => setAdminProfileForm((current) => ({ ...current, organization: event.target.value }))} required /></label>
                  <label>Access level<select value={adminProfileForm.access_level} onChange={(event) => setAdminProfileForm((current) => ({ ...current, access_level: event.target.value }))}><option>Super Admin</option><option>Admin</option><option>Coordinator</option><option>Mentor</option></select></label>
                  <label>Availability<select value={adminProfileForm.availability} onChange={(event) => setAdminProfileForm((current) => ({ ...current, availability: event.target.value }))}><option>Online</option><option>Busy</option><option>Away</option></select></label>
                  <label>Profile photo<input type="file" accept="image/*" onChange={handleAdminProfilePhotoUpload} /></label>
                  {adminProfileForm.profile_photo ? <img className="profile-photo-preview intern-profile-photo-large" src={adminProfileForm.profile_photo} alt={adminProfileForm.name || 'Admin profile'} /> : null}
                  <div className="settings-toggle-grid detail-card-wide">
                    {Object.entries(adminProfileForm.notification_preferences || {}).filter(([key]) => key !== 'email_frequency').map(([key, value]) => (
                      <label key={key} className="settings-toggle">
                        <input type="checkbox" checked={Boolean(value)} onChange={(event) => setAdminProfileForm((current) => ({ ...current, notification_preferences: { ...current.notification_preferences, [key]: event.target.checked } }))} />
                        <span>{key.replace(/_/g, ' ')}</span>
                      </label>
                    ))}
                  </div>
                  <label>Email frequency<select value={adminProfileForm.notification_preferences?.email_frequency || 'Immediate'} onChange={(event) => setAdminProfileForm((current) => ({ ...current, notification_preferences: { ...current.notification_preferences, email_frequency: event.target.value } }))}><option>Immediate</option><option>Daily</option><option>Weekly</option></select></label>
                  <button type="submit" className="primary-button">Save Profile</button>
                </form>
              ) : null}
              <div className="admin-profile-grid">
                <div className="settings-list-item"><strong>Name:</strong> {adminSession.name}</div>
                <div className="settings-list-item"><strong>Email:</strong> {adminSession.email}</div>
                <div className="settings-list-item"><strong>Role:</strong> {adminSession.designation || adminSession.role || 'System Administrator'}</div>
                <div className="settings-list-item"><strong>Phone:</strong> {adminSession.phone || 'Not set'}</div>
                <div className="settings-list-item"><strong>Organization:</strong> {adminSession.organization || 'Intern Tracker Labs'}</div>
                <div className="settings-list-item"><strong>Access:</strong> {adminSession.access_level || 'Full Admin Control'}</div>
                <div className="settings-list-item"><strong>Status:</strong> {adminSession.availability || 'Online'}</div>
                <div className="settings-list-item"><strong>Handles:</strong> Intern Management & Onboarding</div>
                <div className="settings-list-item"><strong>Handles:</strong> Project and Task Monitoring</div>
                <div className="settings-list-item"><strong>Handles:</strong> Performance & Evaluation</div>
                <div className="settings-list-item"><strong>Handles:</strong> Admin Control & System Configuration</div>
                <div className="settings-list-item"><strong>Handles:</strong> Communication & Notifications</div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence>
          {showNotifications ? (
            <motion.div className="notification-drawer" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <div className="notification-header">
                <strong>Notifications</strong>
                <button type="button" className="ghost-button" onClick={() => setShowNotifications(false)}>Close</button>
              </div>
              <div className="activity-list">
                {dashboard.alerts.pendingTasks.slice(0, 3).map((task) => (
                  <button key={task.id} type="button" className="activity-item notification-item-button" onClick={() => { setActiveSection('projects'); setSectionFocus('pending-tasks'); setShowNotifications(false); }}>
                    <div className="activity-dot activity-task" />
                    <div><p>{task.title}</p><span>{task.status} until {formatDate(task.deadline)}</span></div>
                  </button>
                ))}
                {dashboard.alerts.lowAttendance.slice(0, 3).map((item) => (
                  <button key={item.internId} type="button" className="activity-item notification-item-button" onClick={() => { setActiveSection('evaluations'); setSectionFocus('all'); setShowNotifications(false); }}>
                    <div className="activity-dot activity-attendance" />
                    <div><p>{item.name}</p><span>{item.attendanceRate}% attendance</span></div>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {error ? <div className="inline-error">{error}</div> : null}
        <AnimatePresence>
          {successMessage ? (
            <motion.div className="inline-success success-banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <CheckCircle2 size={16} />
              <span>{successMessage}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div key={activeSection} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}>
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>
      {showInternModal ? (
        <div className="modal-backdrop" onClick={() => setShowInternModal(false)}>
          <div className="modal-card modal-card-scrollable" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div><p className="panel-kicker">{editingIntern ? 'Edit Intern' : 'Add Intern'}</p><h2>{editingIntern ? 'Update intern information' : 'Create a new intern record'}</h2></div>
              <button className="ghost-button" onClick={() => setShowInternModal(false)}>Close</button>
            </div>
            <form className="intern-form" onSubmit={handleInternSave}>
              <label>Full name<input value={internForm.name} onChange={(event) => setInternForm((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label>Email<input type="email" value={internForm.email} onChange={(event) => setInternForm((current) => ({ ...current, email: event.target.value }))} required /></label>
              <label>Phone<input value={internForm.phone} onChange={(event) => setInternForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label>College<input value={internForm.college} onChange={(event) => setInternForm((current) => ({ ...current, college: event.target.value }))} /></label>
              <label>Domain<input value={internForm.domain} onChange={(event) => setInternForm((current) => ({ ...current, domain: event.target.value }))} required /></label>
              <label>Skills<input value={internForm.skills} onChange={(event) => setInternForm((current) => ({ ...current, skills: event.target.value }))} placeholder="React, FastAPI, Testing" /></label>
              <label>Mentor<input value={internForm.mentor} onChange={(event) => setInternForm((current) => ({ ...current, mentor: event.target.value }))} required /></label>
              <label>Batch<input value={internForm.batch} onChange={(event) => setInternForm((current) => ({ ...current, batch: event.target.value }))} /></label>
              <label>Emergency contact<input value={internForm.emergency_contact} onChange={(event) => setInternForm((current) => ({ ...current, emergency_contact: event.target.value }))} /></label>
              <label>Start date<input type="date" value={internForm.start_date} onChange={(event) => setInternForm((current) => ({ ...current, start_date: event.target.value }))} required /></label>
              <label>End date<input type="date" value={internForm.end_date} onChange={(event) => setInternForm((current) => ({ ...current, end_date: event.target.value }))} required /></label>
              <label>Notes<textarea value={internForm.notes} onChange={(event) => setInternForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              <div className="detail-card detail-card-wide upload-manager">
                <strong>Document Management</strong>
                <span>One upload and download area for all required intern records.</span>
                <div className="document-grid">
                  {Object.entries(documentSlotLabels).map(([slot, label]) => (
                    <div key={slot} className="document-tile">
                      <strong>{label}</strong>
                      <span>{internForm.document_records?.[slot]?.file_name || 'No file uploaded yet'}</span>
                      <input type="file" onChange={(event) => handleInternDocumentUpload(slot, event.target.files?.[0])} />
                      <div className="table-action-row">
                        {internForm.document_records?.[slot]?.data_url ? <button className="table-action" type="button" onClick={() => downloadDataUrl(internForm.document_records[slot].data_url, internForm.document_records[slot].file_name)}>Download</button> : null}
                        {internForm.document_records?.[slot]?.data_url ? <button className="table-action" type="button" onClick={() => handleInternDocumentRemove(slot)}>Remove</button> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button className="primary-button submit-button" type="submit" disabled={isSavingIntern}>{isSavingIntern ? 'Saving...' : editingIntern ? 'Save Changes' : 'Save Intern'}</button>
            </form>
          </div>
        </div>
      ) : null}
      {showMessageModal ? (
        <div className="modal-backdrop" onClick={() => setShowMessageModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Direct Email</p>
                <h2>Send a message to {selectedInternForMessage?.name}</h2>
              </div>
              <button className="ghost-button" onClick={() => setShowMessageModal(false)}>Close</button>
            </div>
            <form className="intern-form" onSubmit={handleSendMessage}>
              <label>To<input value={selectedInternForMessage?.email || ''} disabled /></label>
              <label>Subject<input value={messageForm.subject} onChange={(event) => setMessageForm((current) => ({ ...current, subject: event.target.value }))} required /></label>
              <label>Message<textarea className="message-textarea" value={messageForm.message} onChange={(event) => setMessageForm((current) => ({ ...current, message: event.target.value }))} required /></label>
              <div className="helper-note">This sends a direct admin update to the selected intern and records the message in the email audit log.</div>
              <button className="primary-button submit-button" type="submit" disabled={isSendingMessage}>{isSendingMessage ? 'Sending...' : 'Send Email'}</button>
            </form>
          </div>
        </div>
      ) : null}
      {showBroadcastModal ? (
        <div className="modal-backdrop" onClick={() => setShowBroadcastModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div><p className="panel-kicker">Announcement</p><h2>Send an update to interns</h2></div>
              <button className="ghost-button" onClick={() => setShowBroadcastModal(false)}>Close</button>
            </div>
            <form className="intern-form" onSubmit={handleBroadcastSend}>
              <label>Recipients<select value={broadcastForm.recipient_mode} onChange={(event) => setBroadcastForm((current) => ({ ...current, recipient_mode: event.target.value }))}><option value="all">All interns</option><option value="filtered">Filtered interns</option></select></label>
              <label>Subject<input value={broadcastForm.subject} onChange={(event) => setBroadcastForm((current) => ({ ...current, subject: event.target.value }))} required /></label>
              <label>Message<textarea className="message-textarea" value={broadcastForm.message} onChange={(event) => setBroadcastForm((current) => ({ ...current, message: event.target.value }))} required /></label>
              {broadcastForm.recipient_mode === 'filtered' ? (
                <div className="recipient-picker">
                  <div className="recipient-picker-header">
                    <strong>Select interns</strong>
                    <span>{broadcastForm.selected_intern_ids.length} selected</span>
                  </div>
                  <div className="recipient-list">
                    {dashboard.interns.map((intern) => (
                      <label key={intern.id} className="recipient-item">
                        <input
                          type="checkbox"
                          checked={broadcastForm.selected_intern_ids.includes(intern.id)}
                          onChange={(event) => setBroadcastForm((current) => ({
                            ...current,
                            selected_intern_ids: event.target.checked
                              ? [...current.selected_intern_ids, intern.id]
                              : current.selected_intern_ids.filter((id) => id !== intern.id),
                          }))}
                        />
                        <span>{intern.name}</span>
                        <small>{intern.email}</small>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="helper-note">Recipient count: {broadcastForm.recipient_mode === 'all' ? dashboard.interns.length : broadcastForm.selected_intern_ids.length}</div>
              <button className="primary-button submit-button" type="submit" disabled={isSendingBroadcast}>{isSendingBroadcast ? 'Sending...' : 'Send Announcement'}</button>
            </form>
          </div>
        </div>
      ) : null}
      {showEvaluationModal ? (
        <div className="modal-backdrop" onClick={() => setShowEvaluationModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Performance Review</p>
                <h2>Submit an intern evaluation</h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => setShowEvaluationModal(false)}>Close</button>
            </div>
            <form className="review-form" onSubmit={handleEvaluationSubmit}>
              <div className="review-form-top">
                <label>Intern<select value={evaluationForm.intern_id} onChange={(event) => setEvaluationForm((current) => ({ ...current, intern_id: event.target.value }))} required>{dashboard.interns.map((intern) => <option key={intern.id} value={intern.id}>{intern.name}</option>)}</select></label>
                <label>Date<input type="date" value={evaluationForm.evaluation_date} onChange={(event) => setEvaluationForm((current) => ({ ...current, evaluation_date: event.target.value }))} required /></label>
              </div>
              <div className="review-score-grid">
                <label>Communication<input type="number" min="1" max="10" value={evaluationForm.communication} onChange={(event) => setEvaluationForm((current) => ({ ...current, communication: event.target.value }))} /></label>
                <label>Technical Skill<input type="number" min="1" max="10" value={evaluationForm.technical_skill} onChange={(event) => setEvaluationForm((current) => ({ ...current, technical_skill: event.target.value }))} /></label>
                <label>Teamwork<input type="number" min="1" max="10" value={evaluationForm.teamwork} onChange={(event) => setEvaluationForm((current) => ({ ...current, teamwork: event.target.value }))} /></label>
                <label>Ownership<input type="number" min="1" max="10" value={evaluationForm.ownership} onChange={(event) => setEvaluationForm((current) => ({ ...current, ownership: event.target.value }))} /></label>
              </div>
              <label className="review-comments">Comments<textarea value={evaluationForm.comments} onChange={(event) => setEvaluationForm((current) => ({ ...current, comments: event.target.value }))} required /></label>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="secondary-button auth-submit" type="submit" disabled={isSubmittingEvaluation}>{isSubmittingEvaluation ? 'Saving...' : 'Save Review'}</motion.button>
            </form>
          </div>
        </div>
      ) : null}
      {showInternDetailModal && selectedInternDetail ? (
        <div className="modal-backdrop" onClick={() => setShowInternDetailModal(false)}>
          <div className="modal-card detail-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div><p className="panel-kicker">Intern Profile</p><h2>{selectedInternDetail.name}</h2></div>
              <button className="ghost-button" onClick={() => setShowInternDetailModal(false)}>Close</button>
            </div>
            <div className="detail-grid">
              <div className="detail-card"><strong>Email</strong><span>{selectedInternDetail.email}</span></div>
              <div className="detail-card"><strong>Phone</strong><span>{selectedInternDetail.phone || 'Not set'}</span></div>
              <div className="detail-card"><strong>College</strong><span>{selectedInternDetail.college || 'Not set'}</span></div>
              <div className="detail-card"><strong>Domain</strong><span>{selectedInternDetail.domain}</span></div>
              <div className="detail-card"><strong>Mentor</strong><span>{selectedInternDetail.mentor}</span></div>
              <div className="detail-card"><strong>Batch</strong><span>{selectedInternDetail.batch || 'Current Cycle'}</span></div>
              <div className="detail-card"><strong>Emergency Contact</strong><span>{selectedInternDetail.emergency_contact || 'Not set'}</span></div>
              <div className="detail-card"><strong>Documents</strong><span>{selectedInternDetail.documents?.join(', ') || 'No documents added'}</span></div>
              <div className="detail-card detail-card-wide"><strong>Badges</strong><span>{selectedInternDetail.earnedBadges?.join(', ') || selectedInternDetail.badges?.join(', ') || 'No badges earned yet'}</span></div>
              <div className="detail-card detail-card-wide"><strong>Skills</strong><span>{selectedInternDetail.skills?.join(', ') || 'No skills added'}</span></div>
              <div className="detail-card detail-card-wide"><strong>Admin Notes</strong><span>{selectedInternDetail.notes || 'No notes yet'}</span></div>
              <div className="detail-card detail-card-wide">
                <strong>Stored Files</strong>
                <div className="document-grid top-gap">
                  {getDocumentEntries(selectedInternDetail.documentRecords).length ? getDocumentEntries(selectedInternDetail.documentRecords).map((doc) => (
                    <div key={doc.key} className="document-tile">
                      <strong>{doc.label}</strong>
                      <span>{doc.file_name || 'Document slot created'}</span>
                      {doc.data_url ? <button className="table-action" type="button" onClick={() => downloadDataUrl(doc.data_url, doc.file_name || `${doc.label}.file`)}>Download</button> : <span className="muted-copy">No uploaded file yet</span>}
                    </div>
                  )) : <span className="muted-copy">No stored files yet.</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
