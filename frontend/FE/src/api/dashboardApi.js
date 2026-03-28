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

export async function markAttendance(payload) {
  try {
    const response = await axiosInstance.post('/attendance/', payload);
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
