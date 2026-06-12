import axios from "axios";
import { API_URL } from "./api";

export const authService = {
  // ============================
  // 🔹 AUTHENTICATION
  // ============================

  // Login User
  login: async (credentials: any) => {
    try {
      const response = await axios.post(`${API_URL}/login`, credentials, { timeout: 15000 });
      if (response.data.access_token) {
        localStorage.setItem("cvmaster_user", JSON.stringify(response.data.user));
        localStorage.setItem("cvmaster_token", response.data.access_token);
        localStorage.setItem("token", response.data.access_token); // Backward compatibility
      }
      return response.data;
    } catch (error: any) {
      throw error.response?.data || error.message;
    }
  },

  // Logout
  logout: async () => {
    try {
      const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
      if (token) {
        await axios.post(`${API_URL}/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (error) {
      console.error("Logout API call failed:", error);
    } finally {
      // Clear all stored data
      localStorage.removeItem("cvmaster_user");
      localStorage.removeItem("cvmaster_token");
      localStorage.removeItem("token");
      localStorage.removeItem("cvmaster_profile");
      localStorage.removeItem("cvmaster_saved_jobs");
    }
  },

  // Check if authenticated
  isAuthenticated: () => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    const user = localStorage.getItem("cvmaster_user");
    return !!(token && user);
  },

  // Get stored token
  getToken: () => {
    return localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
  },

  // Get stored user
  getUser: () => {
    const userData = localStorage.getItem("cvmaster_user");
    return userData ? JSON.parse(userData) : null;
  },

  // ============================
  // 🔹 USER PROFILE
  // ============================

  // Get Profile
  getProfile: async () => {
    try {
      const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found.");

      const response = await axios.get(`${API_URL}/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      // Store profile data
      if (response.data.profile) {
        localStorage.setItem("cvmaster_profile", JSON.stringify(response.data.profile));
      }

      return response.data.profile;
    } catch (error: any) {
      throw error.response?.data || error.message;
    }
  },

  // Update Profile
  updateProfile: async (profileData: any) => {
    try {
      const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found.");

      const response = await axios.put(`${API_URL}/profile`, profileData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      // Update stored profile
      if (response.data.profile) {
        localStorage.setItem("cvmaster_profile", JSON.stringify(response.data.profile));
      }

      return response.data.profile;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error("Error updating profile:", error.response?.data);
        throw error.response?.data || error.message;
      } else {
        console.error("Unexpected error:", error);
        throw error;
      }
    }
  },

  // ============================
  // 🔹 RAG AI FEATURES
  // ============================

  // Get AI-powered job recommendations
  getRAGRecommendations: async (limit: number = 10) => {
    try {
      const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found.");

      const response = await axios.get(`${API_URL}/rag/recommendations`, {
        params: { limit },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      return response.data;
    } catch (error: any) {
      throw error.response?.data || error.message;
    }
  },

  // Search jobs using natural language
  searchJobsRAG: async (query: string, limit: number = 10) => {
    try {
      const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found.");

      const response = await axios.post(
        `${API_URL}/rag/search-jobs`,
        { query, limit },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      return response.data;
    } catch (error: any) {
      throw error.response?.data || error.message;
    }
  },

  // Get profile embedding status
  getProfileEmbeddingStatus: async () => {
    try {
      const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found.");

      const response = await axios.get(`${API_URL}/rag/profile/embedding-status`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      return response.data;
    } catch (error: any) {
      throw error.response?.data || error.message;
    }
  },

  // Generate profile embedding
  generateProfileEmbedding: async () => {
    try {
      const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found.");

      const response = await axios.post(
        `${API_URL}/rag/profile/generate-embedding`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      return response.data;
    } catch (error: any) {
      throw error.response?.data || error.message;
    }
  },

  // Get candidate recommendations for a job (recruiters)
  getCandidatesForJob: async (jobId: number, limit: number = 10) => {
    try {
      const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found.");

      const response = await axios.get(`${API_URL}/rag/jobs/${jobId}/candidates`, {
        params: { limit },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      return response.data;
    } catch (error: any) {
      throw error.response?.data || error.message;
    }
  },

  // Generate job embedding
  generateJobEmbedding: async (jobId: number) => {
    try {
      const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found.");

      const response = await axios.post(
        `${API_URL}/rag/jobs/${jobId}/generate-embedding`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      return response.data;
    } catch (error: any) {
      throw error.response?.data || error.message;
    }
  },

  // Generate all job embeddings (admin)
  generateAllJobEmbeddings: async () => {
    try {
      const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found.");

      const response = await axios.post(
        `${API_URL}/rag/jobs/generate-all-embeddings`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      return response.data;
    } catch (error: any) {
      throw error.response?.data || error.message;
    }
  },

  // Generate all profile embeddings (admin)
  generateAllProfileEmbeddings: async () => {
    try {
      const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found.");

      const response = await axios.post(
        `${API_URL}/rag/profiles/generate-all-embeddings`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      return response.data;
    } catch (error: any) {
      throw error.response?.data || error.message;
    }
  },

  // ============================
  // 🔹 ADMIN CRUDS
  // ============================

  // ----- USERS -----
  getAllUsers: async () => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    const res = await axios.get(`${API_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },

  getCurrentUser: async () => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    const res = await axios.get(`${API_URL}/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },

  getUserById: async (id: number) => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    const res = await axios.get(`${API_URL}/admin/users/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },

  addUser: async (userData: any) => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    if (!token) throw new Error("Authentication token is missing.");

    try {
      const res = await axios.post(`${API_URL}/admin/users`, userData, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      return res.data;
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to add user. Please try again.";
      console.error("Error adding user:", error?.response?.data || message);
      throw new Error(message);
    }
  },

  updateUser: async (id: number, data: any) => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    if (!token) throw new Error("Authentication token is missing.");

    try {
      const filteredData: any = {};
      Object.keys(data).forEach((key) => {
        if (data[key] !== "" && data[key] !== null && data[key] !== undefined) {
          filteredData[key] = data[key];
        }
      });

      const res = await axios.put(`${API_URL}/admin/users/${id}`, filteredData, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      return res.data;
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to update user. Please try again.";
      console.error("Error updating user:", error?.response?.data || message);
      throw new Error(message);
    }
  },

  deleteUser: async (id: number) => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    const res = await axios.delete(`${API_URL}/admin/users/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },

  // ----- COMPANIES -----
  getAllCompanies: async () => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    const res = await axios.get(`${API_URL}/admin/companies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data.data ?? [];
  },

  createCompany: async (companyData: any) => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");

    const res = await axios.post(`${API_URL}/admin/companies`, companyData, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return res.data.data ?? res.data;
  },

  updateCompany: async (id: number | string, data: any) => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");

    const res = await axios.put(`${API_URL}/admin/companies/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return res.data.data ?? res.data;
  },

  deleteCompany: async (id: number) => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    const res = await axios.delete(`${API_URL}/admin/companies/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },

  // ----- JOBS -----
  getAllJobs: async () => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    const res = await axios.get(`${API_URL}/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res;
  },

  applyToJob: async (jobId: number, formData: FormData) => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    if (!token) throw new Error("Authentication token is missing.");

    try {
      const res = await axios.post(`${API_URL}/jobs/${jobId}/apply`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      return res.data;
    } catch (error: any) {
      console.error("Error applying for job:", error.response?.data || error.message);
      throw (
        error.response?.data?.message ||
        "Failed to apply for the job. Please try again."
      );
    }
  },

  createJob: async (jobData: any) => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    try {
      const res = await axios.post(`${API_URL}/admin/jobs`, jobData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error("createJob error response:", error.response?.data);
        throw error.response?.data || error.message;
      }
      throw error;
    }
  },
  // Generate job description using AI
  generateJobDescription: async (payload: any) => {
  const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");

  const res = await axios.post(
    `${API_URL}/admin/jobs/generate-description`,
    payload,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return res.data;
},

  updateJob: async (id: number, data: any) => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    const payload = { ...data, _method: "PUT" };

    const res = await axios.post(`${API_URL}/admin/jobs/${id}`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },

  deleteJob: async (id: number) => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    const res = await axios.delete(`${API_URL}/admin/jobs/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  },

  // Get recommended jobs (legacy - use getRAGRecommendations for AI-powered)
  getRecommendedJobs: async () => {
    const token = localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
    const res = await axios.get(`${API_URL}/jobs/recommended`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res;
  },
};
