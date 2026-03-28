import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CalendarRange,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  NotebookPen,
  Pencil,
  Plus,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  createIntern,
  createTask,
  downloadCertificate,
  getDashboard,
  getTasks,
  loginAdmin,
  markAttendance,
  registerAdmin,
  updateIntern,
  updateTask,
} from './api/dashboardApi';
import './App.css';

const SESSION_KEY = 'intern_tracking_admin';
const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'interns', label: 'Interns', icon: Users },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'attendance', label: 'Attendance', icon: CheckSquare },
  { id: 'certifications', label: 'Certificates', icon: Award },
];
const toneClassMap = {
  neutral: 'tone-neutral',
  success: 'tone-success',
  warning: 'tone-warning',
  danger: 'tone-danger',
};
const emptyInternForm = { name: '', email: '', domain: '', mentor: '', start_date: '', end_date: '', status: 'On Track' };
const emptyTaskForm = {
  title: '', description: '', assigned_to: '', priority: 'Medium', start_date: '',
  deadline: '', status: 'Pending', progress: 0, deliverable: '',
};
const emptyAttendanceForm = { intern_id: '', date: '', status: 'Present' };
const emptyLoginForm = { email: '', password: '' };
const emptyRegisterForm = { name: '', email: '', password: '' };

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

function AuthScreen({
  authMode, loginForm, registerForm, onLoginChange, onRegisterChange,
  onLogin, onRegister, setAuthMode, authLoading, error,
}) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <p className="eyebrow">Admin Access</p>
          <h1>Intern Tracking System</h1>
          <p>Sign in as an admin to manage interns, tasks, attendance, and certification readiness.</p>
          <div className="default-credentials">
            <strong>Demo admin</strong>
            <span>Email: admin@interntrack.com</span>
            <span>Password: admin123</span>
          </div>
        </div>
        <div className="auth-panel">
          <div className="auth-toggle">
            <button type="button" className={authMode === 'login' ? 'auth-tab active' : 'auth-tab'} onClick={() => setAuthMode('login')}>Login</button>
            <button type="button" className={authMode === 'register' ? 'auth-tab active' : 'auth-tab'} onClick={() => setAuthMode('register')}>Register</button>
          </div>
          {error ? <div className="inline-error">{error}</div> : null}
          {authMode === 'login' ? (
            <form className="auth-form" onSubmit={onLogin}>
              <label>Admin email<input name="email" type="email" value={loginForm.email} onChange={onLoginChange} required /></label>
              <label>Password<input name="password" type="password" value={loginForm.password} onChange={onLoginChange} required /></label>
              <button className="primary-button auth-submit" type="submit" disabled={authLoading}>{authLoading ? 'Signing in...' : 'Login'}</button>
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
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showInternModal, setShowInternModal] = useState(false);
  const [editingIntern, setEditingIntern] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');
  const [internForm, setInternForm] = useState(emptyInternForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [attendanceForm, setAttendanceForm] = useState(emptyAttendanceForm);
  const [loginForm, setLoginForm] = useState(emptyLoginForm);
  const [registerForm, setRegisterForm] = useState(emptyRegisterForm);
  const [adminSession, setAdminSession] = useState(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [authMode, setAuthMode] = useState('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [isSavingIntern, setIsSavingIntern] = useState(false);
  const [isTaskSubmitting, setIsTaskSubmitting] = useState(false);
  const [isAttendanceSubmitting, setIsAttendanceSubmitting] = useState(false);
  const [downloadingCertificateId, setDownloadingCertificateId] = useState('');

  const maxTaskValue = useMemo(() => {
    if (!dashboard?.taskCompletion?.length) return 1;
    return Math.max(...dashboard.taskCompletion.map((item) => item.value), 1);
  }, [dashboard]);

  const heatmapGridStyle = useMemo(() => {
    const totalDates = dashboard?.attendanceHeatmap?.dates?.length || 14;
    return { gridTemplateColumns: `160px repeat(${totalDates}, minmax(18px, 1fr))` };
  }, [dashboard]);

  const loadDashboard = useCallback(async () => {
    if (!adminSession) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const [data, taskItems] = await Promise.all([getDashboard(), getTasks()]);
      setDashboard(data);
      setTasks(taskItems);
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
      intern_id: current.intern_id || dashboard.interns[0].id,
      date: current.date || new Date().toISOString().slice(0, 10),
    }));
  }, [dashboard]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = window.setTimeout(() => setSuccessMessage(''), 3000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const openAddIntern = () => {
    setEditingIntern(null);
    setInternForm(emptyInternForm);
    setShowInternModal(true);
  };

  const openEditIntern = (intern) => {
    setEditingIntern(intern);
    setInternForm({
      name: intern.name,
      email: intern.email,
      domain: intern.domain,
      mentor: intern.mentor,
      start_date: intern.startDate,
      end_date: intern.endDate,
      status: intern.status === 'Certificate Ready' ? 'On Track' : intern.status,
    });
    setShowInternModal(true);
  };

  const handleAuthSuccess = (admin) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(admin));
    setAdminSession(admin);
    setSuccessMessage(`Welcome, ${admin.name}.`);
    setError('');
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    try {
      setAuthLoading(true);
      setError('');
      const response = await loginAdmin(loginForm);
      handleAuthSuccess(response.admin);
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
    localStorage.removeItem(SESSION_KEY);
    setAdminSession(null);
    setDashboard(null);
    setTasks([]);
    setActiveSection('overview');
  };

  const handleInternSave = async (event) => {
    event.preventDefault();
    try {
      setIsSavingIntern(true);
      setError('');
      if (editingIntern) {
        await updateIntern(editingIntern.id, internForm);
        setSuccessMessage('Intern updated successfully.');
      } else {
        await createIntern(internForm);
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

  const handleAttendanceSubmit = async (event) => {
    event.preventDefault();
    try {
      setIsAttendanceSubmitting(true);
      setError('');
      await markAttendance(attendanceForm);
      setSuccessMessage('Attendance updated successfully.');
      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Unable to mark attendance.');
    } finally {
      setIsAttendanceSubmitting(false);
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
      <section className="stats-grid">
        {dashboard.stats.map((item) => (
          <article key={item.label} className={`stat-card ${toneClassMap[item.tone] || ''}`}>
            <div className="stat-label">{item.label}</div>
            <div className="stat-value">{item.value}</div>
            <p>{item.description}</p>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><div><p className="panel-kicker">Task Completion Chart</p><h2>Delivery snapshot</h2></div><ClipboardList size={20} /></div>
          <div className="chart-stack">
            {dashboard.taskCompletion.map((item) => (
              <div key={item.label} className="chart-row">
                <div className="chart-labels"><span>{item.label}</span><strong>{item.value}</strong></div>
                <div className="chart-bar"><span style={{ width: `${(item.value / maxTaskValue) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><div><p className="panel-kicker">Recent Activity</p><h2>Latest updates</h2></div><CalendarRange size={20} /></div>
          <div className="activity-list">
            {dashboard.recentActivity.map((item) => (
              <div key={item.id} className="activity-item">
                <div className={`activity-dot activity-${item.kind}`} />
                <div><p>{item.message}</p><span>{relativeTime(item.timestamp)}</span></div>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><div><p className="panel-kicker">Alerts</p><h2>Items that need action</h2></div><AlertTriangle size={20} /></div>
          <div className="alert-grid">
            <div className="alert-box">
              <h3>Low attendance</h3>
              {dashboard.alerts.lowAttendance.length ? dashboard.alerts.lowAttendance.map((item) => (
                <p key={item.internId}>{item.name} is at <strong>{item.attendanceRate}%</strong> attendance.</p>
              )) : <p>All interns are above the alert threshold.</p>}
            </div>
            <div className="alert-box">
              <h3>Pending tasks</h3>
              {dashboard.alerts.pendingTasks.length ? dashboard.alerts.pendingTasks.map((task) => (
                <p key={task.id}>{task.title} is <strong>{task.status}</strong> until {formatDate(task.deadline)}.</p>
              )) : <p>No pending tasks right now.</p>}
            </div>
          </div>
        </article>
      </section>
    </>
  );

  const renderInterns = () => (
    <section className="dashboard-grid single-column">
      <article className="panel">
        <div className="panel-header">
          <div><p className="panel-kicker">Intern Management</p><h2>Track and edit intern profiles</h2></div>
          <button className="primary-button" onClick={openAddIntern}><Plus size={16} />Add Intern</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Intern</th><th>Domain</th><th>Mentor</th><th>Attendance</th><th>Tasks</th><th>Timeline</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {dashboard.interns.map((intern) => (
                <tr key={intern.id}>
                  <td><strong>{intern.name}</strong><span>{intern.email}</span></td>
                  <td>{intern.domain}</td>
                  <td>{intern.mentor}</td>
                  <td>{intern.attendanceRate}%</td>
                  <td>{intern.completedTasks}/{intern.totalTasks}</td>
                  <td><span>{formatDate(intern.startDate)}</span><span>{formatDate(intern.endDate)}</span></td>
                  <td><span className={`status-pill ${intern.status.toLowerCase().replace(/\s+/g, '-')}`}>{intern.status}</span></td>
                  <td><button className="table-action" type="button" onClick={() => openEditIntern(intern)}><Pencil size={14} />Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );

  const renderTasks = () => (
    <section className="dashboard-grid">
      <article className="panel">
        <div className="panel-header"><div><p className="panel-kicker">Assign Task</p><h2>Create a new task</h2></div><NotebookPen size={20} /></div>
        <form className="stack-form" onSubmit={handleTaskSubmit}>
          <label>Task title<input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} required /></label>
          <label>Description<textarea value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} required /></label>
          <label>Assign to<select value={taskForm.assigned_to} onChange={(event) => setTaskForm((current) => ({ ...current, assigned_to: event.target.value }))} required>{dashboard.interns.map((intern) => <option key={intern.id} value={intern.id}>{intern.name}</option>)}</select></label>
          <label>Priority<select value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))}><option>Low</option><option>Medium</option><option>High</option></select></label>
          <label>Start date<input type="date" value={taskForm.start_date} onChange={(event) => setTaskForm((current) => ({ ...current, start_date: event.target.value }))} required /></label>
          <label>Deadline<input type="date" value={taskForm.deadline} onChange={(event) => setTaskForm((current) => ({ ...current, deadline: event.target.value }))} required /></label>
          <label>Deliverable<input value={taskForm.deliverable} onChange={(event) => setTaskForm((current) => ({ ...current, deliverable: event.target.value }))} /></label>
          <button className="primary-button auth-submit" type="submit" disabled={isTaskSubmitting}>{isTaskSubmitting ? 'Assigning...' : 'Assign Task'}</button>
        </form>
      </article>
      <article className="panel">
        <div className="panel-header"><div><p className="panel-kicker">Task Board</p><h2>Manage task progress</h2></div><ClipboardList size={20} /></div>
        <div className="task-board">
          {tasks.map((task) => {
            const assignee = dashboard.interns.find((intern) => intern.id === task.assigned_to);
            return (
              <div key={task.id} className="task-card">
                <div className="task-card-top">
                  <div><strong>{task.title}</strong><span>{assignee?.name || 'Unassigned'} | {task.priority}</span></div>
                  <span className={`status-pill ${task.status.toLowerCase().replace(/\s+/g, '-')}`}>{task.status}</span>
                </div>
                <p>{task.description}</p>
                <div className="task-meta"><span>Start: {formatDate(task.start_date)}</span><span>Deadline: {formatDate(task.deadline)}</span><span>Progress: {task.progress}%</span></div>
                <div className="mini-progress"><span style={{ width: `${task.progress}%` }} /></div>
                <button className="secondary-button" type="button" onClick={() => handleTaskStatusUpdate(task.id, task.status, task.progress)}>
                  {task.status === 'Completed' ? 'Move To In Progress' : 'Mark Completed'}
                </button>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );

  const renderAttendance = () => (
    <section className="dashboard-grid">
      <article className="panel">
        <div className="panel-header"><div><p className="panel-kicker">Attendance Update</p><h2>Mark daily attendance</h2></div><CheckSquare size={20} /></div>
        <form className="stack-form" onSubmit={handleAttendanceSubmit}>
          <label>Intern<select value={attendanceForm.intern_id} onChange={(event) => setAttendanceForm((current) => ({ ...current, intern_id: event.target.value }))} required>{dashboard.interns.map((intern) => <option key={intern.id} value={intern.id}>{intern.name}</option>)}</select></label>
          <label>Date<input type="date" value={attendanceForm.date} onChange={(event) => setAttendanceForm((current) => ({ ...current, date: event.target.value }))} required /></label>
          <label>Status<select value={attendanceForm.status} onChange={(event) => setAttendanceForm((current) => ({ ...current, status: event.target.value }))}><option>Present</option><option>Absent</option><option>Leave</option></select></label>
          <button className="primary-button auth-submit" type="submit" disabled={isAttendanceSubmitting}>{isAttendanceSubmitting ? 'Saving...' : 'Mark Attendance'}</button>
        </form>
      </article>
      <article className="panel">
        <div className="panel-header"><div><p className="panel-kicker">Attendance Heatmap</p><h2>Monitor intern consistency</h2></div><CheckCircle2 size={20} /></div>
        <div className="heatmap-wrap">
          <div className="heatmap-dates" style={heatmapGridStyle}><span>Intern</span>{dashboard.attendanceHeatmap.dates.map((item) => <span key={item}>{new Date(item).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>)}</div>
          {dashboard.attendanceHeatmap.rows.map((row) => (
            <div key={row.internName} className="heatmap-row" style={heatmapGridStyle}>
              <span className="heatmap-name">{row.internName}</span>
              {row.values.map((cell) => <span key={`${row.internName}-${cell.date}`} className={`heatmap-cell ${cell.status.toLowerCase()}`} title={`${row.internName} - ${cell.status} on ${formatDate(cell.date)}`} />)}
            </div>
          ))}
        </div>
      </article>
    </section>
  );

  const renderCertifications = () => (
    <section className="dashboard-grid single-column">
      <article className="panel">
        <div className="panel-header"><div><p className="panel-kicker">Certification</p><h2>Readiness tracker</h2></div><Award size={20} /></div>
        <div className="certificate-list">
          {dashboard.certifications.map((item) => (
            <div key={item.internId} className="certificate-card">
              <div>
                <strong>{item.name}</strong>
                <span>{item.completedTasks}/{item.totalTasks} tasks, {item.attendanceRate}% attendance</span>
              </div>
              <div className="certificate-actions">
                <span className={`certificate-status ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>{item.status}</span>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!item.canDownload || downloadingCertificateId === item.internId}
                  onClick={() => handleCertificateDownload(item)}
                >
                  {downloadingCertificateId === item.internId ? 'Generating...' : item.canDownload ? 'Download Certificate' : 'Not Ready'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'interns': return renderInterns();
      case 'tasks': return renderTasks();
      case 'attendance': return renderAttendance();
      case 'certifications': return renderCertifications();
      default: return renderOverview();
    }
  };

  if (!adminSession) {
    return (
      <AuthScreen
        authMode={authMode}
        loginForm={loginForm}
        registerForm={registerForm}
        onLoginChange={(event) => setLoginForm((current) => ({ ...current, [event.target.name]: event.target.value }))}
        onRegisterChange={(event) => setRegisterForm((current) => ({ ...current, [event.target.name]: event.target.value }))}
        onLogin={handleLogin}
        onRegister={handleRegister}
        setAuthMode={setAuthMode}
        authLoading={authLoading}
        error={error}
      />
    );
  }

  if (loading || !dashboard) {
    return <div className="page-shell loading-state"><LoaderCircle className="spin" /><p>Loading the internship dashboard...</p></div>;
  }

  return (
    <div className="workspace-shell">
      <aside className="sidebar-shell">
        <div>
          <p className="eyebrow">Admin Console</p>
          <h2 className="sidebar-title">Intern Tracker</h2>
          <p className="sidebar-copy">Logged in as {adminSession.name}</p>
        </div>
        <nav className="sidebar-nav">
          {sections.map((section) => {
            const Icon = section.icon;
            return <button key={section.id} type="button" className={activeSection === section.id ? 'nav-item active' : 'nav-item'} onClick={() => setActiveSection(section.id)}><Icon size={18} />{section.label}</button>;
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="default-credentials compact"><ShieldCheck size={16} /><span>Default admin: admin@interntrack.com / admin123</span></div>
          <button className="ghost-button logout-button" type="button" onClick={handleLogout}><LogOut size={16} />Logout</button>
        </div>
      </aside>
      <main className="page-shell">
        <div className="hero-panel">
          <div>
            <p className="eyebrow">Intern Tracking System</p>
            <h1>Manage interns with focused sections instead of one long continuous dashboard.</h1>
            <p className="hero-copy">Use the left navigation to open only the area you need: overview, interns, tasks, attendance, or certification.</p>
          </div>
          <div className="hero-actions">
            {activeSection === 'interns' ? <button className="primary-button" onClick={openAddIntern}><Plus size={18} />Add Intern</button> : null}
            <button className="secondary-button" onClick={loadDashboard}>Refresh Data</button>
          </div>
        </div>
        {error ? <div className="inline-error">{error}</div> : null}
        {successMessage ? <div className="inline-success">{successMessage}</div> : null}
        {renderContent()}
      </main>
      {showInternModal ? (
        <div className="modal-backdrop" onClick={() => setShowInternModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div><p className="panel-kicker">{editingIntern ? 'Edit Intern' : 'Add Intern'}</p><h2>{editingIntern ? 'Update intern information' : 'Create a new intern record'}</h2></div>
              <button className="ghost-button" onClick={() => setShowInternModal(false)}>Close</button>
            </div>
            <form className="intern-form" onSubmit={handleInternSave}>
              <label>Full name<input value={internForm.name} onChange={(event) => setInternForm((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label>Email<input type="email" value={internForm.email} onChange={(event) => setInternForm((current) => ({ ...current, email: event.target.value }))} required /></label>
              <label>Domain<input value={internForm.domain} onChange={(event) => setInternForm((current) => ({ ...current, domain: event.target.value }))} required /></label>
              <label>Mentor<input value={internForm.mentor} onChange={(event) => setInternForm((current) => ({ ...current, mentor: event.target.value }))} required /></label>
              <label>Start date<input type="date" value={internForm.start_date} onChange={(event) => setInternForm((current) => ({ ...current, start_date: event.target.value }))} required /></label>
              <label>End date<input type="date" value={internForm.end_date} onChange={(event) => setInternForm((current) => ({ ...current, end_date: event.target.value }))} required /></label>
              <button className="primary-button submit-button" type="submit" disabled={isSavingIntern}>{isSavingIntern ? 'Saving...' : editingIntern ? 'Save Changes' : 'Save Intern'}</button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
