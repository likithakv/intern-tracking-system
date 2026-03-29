import axiosInstance from './axiosInstance';

export async function getDashboard() {
  const response = await axiosInstance.get('/dashboard');
  return response.data;
}

function normalizeError(error) {
  return error.response?.data?.detail || error.message || 'Something went wrong.';
}

export async function createIntern(payload) {
  try {
    const response = await axiosInstance.post('/interns/', payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function getTasks() {
  try {
    const response = await axiosInstance.get('/tasks/');
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function createTask(payload) {
  try {
    const response = await axiosInstance.post('/tasks/', payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function updateTask(taskId, payload) {
  try {
    const response = await axiosInstance.patch(`/tasks/${taskId}`, payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function updateTaskFromIntern(taskId, payload) {
  try {
    const response = await axiosInstance.patch(`/tasks/${taskId}/intern-update`, payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function reviewTaskSubmission(taskId, payload) {
  try {
    const response = await axiosInstance.patch(`/tasks/${taskId}/submission-review`, payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function markAttendance(payload) {
  try {
    const response = await axiosInstance.post('/attendance/', payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function getAttendance() {
  try {
    const response = await axiosInstance.get('/attendance/');
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function getLeaveRequests() {
  try {
    const response = await axiosInstance.get('/attendance/leave-requests');
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function createLeaveRequest(payload) {
  try {
    const response = await axiosInstance.post('/attendance/leave-requests', payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function reviewLeaveRequest(requestId, payload) {
  try {
    const response = await axiosInstance.patch(`/attendance/leave-requests/${requestId}`, payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function updateIntern(internId, payload) {
  try {
    const response = await axiosInstance.patch(`/interns/${internId}`, payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function archiveIntern(internId) {
  try {
    const response = await axiosInstance.patch(`/interns/${internId}/archive`);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function sendInternMessage(internId, payload) {
  try {
    const response = await axiosInstance.post(`/interns/${internId}/message`, payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function sendBroadcastMessage(payload) {
  try {
    const response = await axiosInstance.post('/interns/broadcast', payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function registerAdmin(payload) {
  try {
    const response = await axiosInstance.post('/auth/register', payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function loginAdmin(payload) {
  try {
    const response = await axiosInstance.post('/auth/login', payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function loginIntern(payload) {
  try {
    const response = await axiosInstance.post('/auth/intern-login', payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function updateAdminProfile(adminId, payload) {
  try {
    const response = await axiosInstance.patch(`/auth/profile/${adminId}`, payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function changeAdminPassword(adminId, payload) {
  try {
    const response = await axiosInstance.patch(`/auth/password/${adminId}`, payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function downloadCertificate(internId) {
  try {
    const response = await axiosInstance.get(`/dashboard/certificates/${internId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function downloadDashboardReport() {
  try {
    const response = await axiosInstance.get('/dashboard/report.csv', {
      responseType: 'blob',
    });
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function getInternDashboard(internId) {
  try {
    const response = await axiosInstance.get(`/dashboard/intern/${internId}`);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function getEvaluations() {
  try {
    const response = await axiosInstance.get('/evaluations/');
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function createEvaluation(payload) {
  try {
    const response = await axiosInstance.post('/evaluations/', payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function verifyCertificate(certificateId) {
  try {
    const response = await axiosInstance.get(`/dashboard/certificates/verify/${certificateId}`);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}

export async function changeInternPassword(internId, payload) {
  try {
    const response = await axiosInstance.patch(`/auth/intern-password/${internId}`, payload);
    return response.data;
  } catch (error) {
    throw new Error(normalizeError(error));
  }
}
