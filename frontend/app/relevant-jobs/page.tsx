// "use client";

// import { useEffect, useState } from "react";
// import { useRouter } from "next/navigation";
// import DashboardNav from "@/components/dashboard-nav";
// import { Button } from "@/components/ui/button";
// import { Loader2, RefreshCw, AlertCircle } from "lucide-react";

// interface User {
//   id: number;
//   name: string;
//   email: string;
//   createdAt: string;
// }

// interface Job {
//   job_id: number;
//   title: string;
//   company: string;
//   location: string;
//   type: string;
//   salary_from: number;
//   salary_to: number;
//   similarity_score: number;
//   match_percentage: number;
//   explanation: string;
//   description: string;
//   requirements: string;
// }

// interface ProfileStatus {
//   has_profile: boolean;
//   has_embedding: boolean;
//   embedding_generated_at: string | null;
//   needs_update: boolean;
// }

// const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// export default function RelevantJobsPage() {
//   const router = useRouter();
//   const [user, setUser] = useState<User | null>(null);
//   const [token, setToken] = useState<string>("");
//   const [loading, setLoading] = useState(true);
//   const [loadingJobs, setLoadingJobs] = useState(false);
//   const [generatingEmbedding, setGeneratingEmbedding] = useState(false);
//   const [jobs, setJobs] = useState<Job[]>([]);
//   const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
//   const [searchTerm, setSearchTerm] = useState("");
//   const [locationFilter, setLocationFilter] = useState("");
//   const [savedJobs, setSavedJobs] = useState<string[]>([]);
//   const [profileStatus, setProfileStatus] = useState<ProfileStatus | null>(null);
//   const [error, setError] = useState<string>("");
//   const [limit, setLimit] = useState(10);

//   // Fetch profile status
//   const fetchProfileStatus = async (authToken: string) => {
//     try {
//       const response = await fetch(`${API_BASE_URL}/rag/profile/embedding-status`, {
//         headers: {
//           Authorization: `Bearer ${authToken}`,
//           Accept: "application/json",
//         },
//       });

//       if (response.ok) {
//         const data = await response.json();
//         setProfileStatus(data);
//         return data;
//       }
//     } catch (err) {
//       console.error("Error fetching profile status:", err);
//     }
//   };

//   // Generate profile embedding
//   const generateEmbedding = async () => {
//     if (!token) return;

//     setGeneratingEmbedding(true);
//     setError("");

//     try {
//       const response = await fetch(`${API_BASE_URL}/rag/profile/generate-embedding`, {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${token}`,
//           Accept: "application/json",
//         },
//       });

//       const data = await response.json();

//       if (response.ok) {
//         await fetchProfileStatus(token);
//         // Automatically fetch recommendations after generating embedding
//         fetchRecommendations();
//       } else {
//         setError(data.message || "Failed to generate embedding");
//       }
//     } catch (err) {
//       setError("Failed to connect to server");
//       console.error("Error generating embedding:", err);
//     } finally {
//       setGeneratingEmbedding(false);
//     }
//   };

//   // Fetch RAG recommendations
//   const fetchRecommendations = async () => {
//     if (!token) return;

//     setLoadingJobs(true);
//     setError("");

//     try {
//       const response = await fetch(
//         `${API_BASE_URL}/rag/recommendations?limit=${limit}`,
//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//             Accept: "application/json",
//           },
//         }
//       );

//       const data = await response.json();

//       if (response.ok) {
//         setJobs(data.recommendations || []);
//         setFilteredJobs(data.recommendations || []);
//       } else {
//         setError(data.message || "Failed to load recommendations");
//       }
//     } catch (err) {
//       setError("Failed to connect to server");
//       console.error("Error fetching recommendations:", err);
//     } finally {
//       setLoadingJobs(false);
//     }
//   };

//   // Initialize
//   useEffect(() => {
//     const userData = localStorage.getItem("cvmaster_user");
//     const authToken = localStorage.getItem("cvmaster_token");

//     if (!userData || !authToken) {
//       router.push("/login");
//       return;
//     }

//     const parsedUser = JSON.parse(userData);
//     setUser(parsedUser);
//     setToken(authToken);

//     const saved = localStorage.getItem("cvmaster_saved_jobs");
//     if (saved) {
//       setSavedJobs(JSON.parse(saved));
//     }

//     // Fetch profile status first
//     fetchProfileStatus(authToken).then((status) => {
//       if (status?.has_profile && status?.has_embedding) {
//         // If profile has embedding, fetch recommendations
//         fetchRecommendations();
//       }
//       setLoading(false);
//     });
//   }, [router]);

//   // Filter jobs locally
//   useEffect(() => {
//     let filtered = jobs;

//     if (searchTerm) {
//       filtered = filtered.filter(
//         (job) =>
//           job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
//           job.company.toLowerCase().includes(searchTerm.toLowerCase())
//       );
//     }

//     if (locationFilter) {
//       filtered = filtered.filter((job) =>
//         job.location.toLowerCase().includes(locationFilter.toLowerCase())
//       );
//     }

//     setFilteredJobs(filtered.sort((a, b) => b.match_percentage - a.match_percentage));
//   }, [searchTerm, locationFilter, jobs]);

//   const toggleSaveJob = (jobId: string) => {
//     const updated = savedJobs.includes(jobId)
//       ? savedJobs.filter((id) => id !== jobId)
//       : [...savedJobs, jobId];
//     setSavedJobs(updated);
//     localStorage.setItem("cvmaster_saved_jobs", JSON.stringify(updated));
//   };

//   const formatSalary = (from: number, to: number) => {
//     if (!from && !to) return "Not specified";
//     if (!to) return `$${from.toLocaleString()}+`;
//     return `$${from.toLocaleString()} - $${to.toLocaleString()}`;
//   };

//   if (loading || !user) {
//     return (
//       <div className="flex items-center justify-center min-h-screen">
//         <Loader2 className="w-8 h-8 animate-spin text-accent" />
//       </div>
//     );
//   }

//   return (
//     <div className="min-h-screen bg-background">
//       <DashboardNav user={user} />

//       <main className="max-w-6xl mx-auto px-4 py-12">
//         <div className="bg-white rounded-lg shadow-md p-8">
//           {/* Header */}
//           <div className="flex items-center justify-between mb-6">
//             <div>
//               <h1 className="text-3xl font-bold text-primary mb-2">
//                 AI-Powered Job Recommendations
//               </h1>
//               <p className="text-muted-foreground">
//                 Personalized matches based on your profile
//               </p>
//             </div>
//             <Button
//               onClick={fetchRecommendations}
//               disabled={loadingJobs || !profileStatus?.has_embedding}
//               variant="outline"
//             >
//               <RefreshCw className={`w-4 h-4 mr-2 ${loadingJobs ? "animate-spin" : ""}`} />
//               Refresh
//             </Button>
//           </div>

//           {/* Profile Status Alert */}
//           {profileStatus && !profileStatus.has_profile && (
//             <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
//               <div className="flex items-start">
//                 <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5" />
//                 <div className="flex-1">
//                   <h3 className="font-semibold text-yellow-800 mb-1">
//                     Complete Your Profile
//                   </h3>
//                   <p className="text-sm text-yellow-700 mb-3">
//                     Please complete your profile with bio and experience to get personalized
//                     recommendations.
//                   </p>
//                   <Button
//                     onClick={() => router.push("/profile")}
//                     size="sm"
//                     className="bg-yellow-600 hover:bg-yellow-700"
//                   >
//                     Complete Profile
//                   </Button>
//                 </div>
//               </div>
//             </div>
//           )}

//           {profileStatus && profileStatus.has_profile && !profileStatus.has_embedding && (
//             <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
//               <div className="flex items-start">
//                 <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5" />
//                 <div className="flex-1">
//                   <h3 className="font-semibold text-blue-800 mb-1">
//                     Generate AI Profile
//                   </h3>
//                   <p className="text-sm text-blue-700 mb-3">
//                     Generate your AI profile to get personalized job recommendations.
//                   </p>
//                   <Button
//                     onClick={generateEmbedding}
//                     disabled={generatingEmbedding}
//                     size="sm"
//                     className="bg-blue-600 hover:bg-blue-700"
//                   >
//                     {generatingEmbedding ? (
//                       <>
//                         <Loader2 className="w-4 h-4 mr-2 animate-spin" />
//                         Generating...
//                       </>
//                     ) : (
//                       "Generate AI Profile"
//                     )}
//                   </Button>
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* Error Message */}
//           {error && (
//             <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
//               <div className="flex items-start">
//                 <AlertCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5" />
//                 <div className="flex-1">
//                   <p className="text-sm text-red-700">{error}</p>
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* Filters */}
//           {profileStatus?.has_embedding && (
//             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
//               <div>
//                 <label className="block text-sm font-medium text-foreground mb-2">
//                   Search by Title or Company
//                 </label>
//                 <input
//                   type="text"
//                   value={searchTerm}
//                   onChange={(e) => setSearchTerm(e.target.value)}
//                   className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
//                   placeholder="e.g., React Developer"
//                 />
//               </div>
//               <div>
//                 <label className="block text-sm font-medium text-foreground mb-2">
//                   Filter by Location
//                 </label>
//                 <input
//                   type="text"
//                   value={locationFilter}
//                   onChange={(e) => setLocationFilter(e.target.value)}
//                   className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
//                   placeholder="e.g., Remote, San Francisco"
//                 />
//               </div>
//               <div>
//                 <label className="block text-sm font-medium text-foreground mb-2">
//                   Number of Results
//                 </label>
//                 <select
//                   value={limit}
//                   onChange={(e) => {
//                     setLimit(Number(e.target.value));
//                     fetchRecommendations();
//                   }}
//                   className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
//                 >
//                   <option value="5">5 jobs</option>
//                   <option value="10">10 jobs</option>
//                   <option value="20">20 jobs</option>
//                   <option value="50">50 jobs</option>
//                 </select>
//               </div>
//             </div>
//           )}

//           {/* Loading State */}
//           {loadingJobs && (
//             <div className="flex flex-col items-center justify-center py-12">
//               <Loader2 className="w-12 h-12 animate-spin text-accent mb-4" />
//               <p className="text-muted-foreground">
//                 AI is analyzing your profile and finding the best matches...
//               </p>
//             </div>
//           )}

//           {/* Jobs List */}
//           {!loadingJobs && profileStatus?.has_embedding && (
//             <div className="space-y-4">
//               {filteredJobs.length > 0 ? (
//                 filteredJobs.map((job) => (
//                   <div
//                     key={job.job_id}
//                     className="border border-border rounded-lg p-6 hover:shadow-md transition"
//                   >
//                     <div className="flex items-start justify-between mb-4">
//                       <div className="flex-1">
//                         <h3 className="text-xl font-semibold text-primary">
//                           {job.title}
//                         </h3>
//                         <p className="text-muted-foreground">{job.company}</p>
//                       </div>
//                       <div className="text-right">
//                         <div className="bg-accent text-white px-3 py-1 rounded-full text-sm font-bold mb-2">
//                           {job.match_percentage.toFixed(0)}% Match
//                         </div>
//                         <button
//                           onClick={() => toggleSaveJob(job.job_id.toString())}
//                           className={`text-2xl ${
//                             savedJobs.includes(job.job_id.toString())
//                               ? "text-accent"
//                               : "text-gray-300"
//                           }`}
//                         >
//                           ♥
//                         </button>
//                       </div>
//                     </div>

//                     <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
//                       <div>
//                         <span className="text-muted-foreground">Location:</span>
//                         <p className="font-medium text-foreground">
//                           {job.location}
//                         </p>
//                       </div>
//                       <div>
//                         <span className="text-muted-foreground">Salary:</span>
//                         <p className="font-medium text-foreground">
//                           {formatSalary(job.salary_from, job.salary_to)}
//                         </p>
//                       </div>
//                       <div>
//                         <span className="text-muted-foreground">Type:</span>
//                         <p className="font-medium text-foreground capitalize">
//                           {job.type}
//                         </p>
//                       </div>
//                       <div>
//                         <span className="text-muted-foreground">Match Score:</span>
//                         <p className="font-medium text-foreground">
//                           {job.similarity_score.toFixed(4)}
//                         </p>
//                       </div>
//                     </div>

//                     {/* AI Explanation */}
//                     <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
//                       <p className="text-sm font-medium text-blue-900 mb-1">
//                         🤖 Why this is a good match:
//                       </p>
//                       <p className="text-sm text-blue-800">{job.explanation}</p>
//                     </div>

//                     <p className="text-foreground mb-4 line-clamp-3">
//                       {job.description}
//                     </p>

//                     <div className="mb-4">
//                       <p className="text-sm font-medium text-foreground mb-2">
//                         Requirements:
//                       </p>
//                       <p className="text-sm text-muted-foreground line-clamp-2">
//                         {job.requirements}
//                       </p>
//                     </div>

//                     <Button className="bg-accent hover:bg-accent/90">
//                       Apply Now
//                     </Button>
//                   </div>
//                 ))
//               ) : (
//                 <div className="text-center py-12">
//                   <p className="text-muted-foreground">
//                     No jobs found matching your criteria
//                   </p>
//                 </div>
//               )}
//             </div>
//           )}

//           {/* Back Button */}
//           <div className="mt-8 pt-8 border-t border-border">
//             <Button
//               onClick={() => router.push("/job-search")}
//               variant="outline"
//               className="w-full"
//             >
//               Back to Job Search
//             </Button>
//           </div>
//         </div>
//       </main>
//     </div>
//   );
// }























"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardNav from "@/components/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";

interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

interface Job {
  job_id: number;
  title: string;
  company: string;
  location: string;
  type: string;
  salary_from: number;
  salary_to: number;
  similarity_score: number;
  match_percentage: number;
  explanation: string;
  description: string;
  requirements: string;
}

interface ProfileStatus {
  has_profile: boolean;
  has_embedding: boolean;
  embedding_generated_at: string | null;
  needs_update: boolean;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export default function RelevantJobsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [generatingEmbedding, setGeneratingEmbedding] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [savedJobs, setSavedJobs] = useState<string[]>([]);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus | null>(null);
  const [error, setError] = useState<string>("");
  const [limit, setLimit] = useState(10);

  // Fetch profile status
  const fetchProfileStatus = async (authToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/rag/profile/embedding-status`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProfileStatus(data);
        return data;
      }
    } catch (err) {
      console.error("Error fetching profile status:", err);
    }
  };

  // Generate profile embedding
  const generateEmbedding = async () => {
    if (!token) return;

    setGeneratingEmbedding(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/rag/profile/generate-embedding`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      const data = await response.json();

      if (response.ok) {
        await fetchProfileStatus(token);
        // Automatically fetch recommendations after generating embedding
        fetchRecommendations();
      } else {
        if (data.needs_completion) {
          const missingFields = Object.entries(data.missing_fields || {})
            .filter(([_, value]) => value !== null)
            .map(([_, message]) => message)
            .join(', ');
          
          setError(
            `Profile ${data.profile_completion} complete. To generate AI profile: ${missingFields}`
          );
        } else {
          setError(data.message || "Failed to generate embedding");
        }
      }
    } catch (err) {
      setError("Failed to connect to server");
      console.error("Error generating embedding:", err);
    } finally {
      setGeneratingEmbedding(false);
    }
  };

  // Fetch RAG recommendations
  const fetchRecommendations = async () => {
    if (!token) return;

    setLoadingJobs(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/rag/recommendations?limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        setJobs(data.recommendations || []);
        setFilteredJobs(data.recommendations || []);
        
        // Show success message with count
        if (data.recommendations && data.recommendations.length > 0) {
          setError(""); // Clear any previous errors
        } else {
          setError("No matching jobs found. Try updating your profile with more details.");
        }
      } else {
        // Handle different error types
        if (data.needs_completion) {
          // Profile incomplete - show specific missing fields
          const missingFields = Object.entries(data.missing_fields || {})
            .filter(([_, value]) => value !== null)
            .map(([_, message]) => message)
            .join(', ');
          
          setError(
            `Profile ${data.profile_completion} complete. ${missingFields || 'Please complete your profile.'}`
          );
        } else if (data.has_profile === false) {
          // No profile at all
          setError(data.message || "Please complete your profile first.");
        } else {
          // Other errors
          setError(data.message || "Failed to load recommendations");
        }
      }
    } catch (err) {
      setError("Failed to connect to server");
      console.error("Error fetching recommendations:", err);
    } finally {
      setLoadingJobs(false);
    }
  };

  // Initialize
  useEffect(() => {
    const userData = localStorage.getItem("cvmaster_user");
    const authToken = localStorage.getItem("cvmaster_token");

    if (!userData || !authToken) {
      router.push("/login");
      return;
    }

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    setToken(authToken);

    const saved = localStorage.getItem("cvmaster_saved_jobs");
    if (saved) {
      setSavedJobs(JSON.parse(saved));
    }

    // Fetch profile status first
    fetchProfileStatus(authToken).then((status) => {
      if (status?.has_profile && status?.has_embedding) {
        // Only fetch recommendations if profile is complete
        fetchRecommendations();
      }
      setLoading(false);
    });
  }, [router]);

  // Fetch when limit changes
  useEffect(() => {
    if (token && profileStatus?.has_embedding && !loading) {
      fetchRecommendations();
    }
  }, [limit]);

  // Filter jobs locally
  useEffect(() => {
    let filtered = jobs;

    if (searchTerm) {
      filtered = filtered.filter(
        (job) =>
          job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          job.company.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (locationFilter) {
      filtered = filtered.filter((job) =>
        job.location.toLowerCase().includes(locationFilter.toLowerCase())
      );
    }

    setFilteredJobs(filtered.sort((a, b) => b.match_percentage - a.match_percentage));
  }, [searchTerm, locationFilter, jobs]);

  const toggleSaveJob = (jobId: string) => {
    const updated = savedJobs.includes(jobId)
      ? savedJobs.filter((id) => id !== jobId)
      : [...savedJobs, jobId];
    setSavedJobs(updated);
    localStorage.setItem("cvmaster_saved_jobs", JSON.stringify(updated));
  };

  const formatSalary = (from: number, to: number) => {
    if (!from && !to) return "Not specified";
    if (!to) return `$${from.toLocaleString()}+`;
    return `$${from.toLocaleString()} - $${to.toLocaleString()}`;
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav user={user} />

      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-md p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-primary mb-2">
                AI-Powered Job Recommendations
              </h1>
              <p className="text-muted-foreground">
                Personalized matches based on your profile
              </p>
            </div>
            <Button
              onClick={fetchRecommendations}
              disabled={loadingJobs || !profileStatus?.has_embedding}
              variant="outline"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingJobs ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {/* Profile Status Alert */}
          {profileStatus && !profileStatus.has_profile && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-800 mb-1">
                    Complete Your Profile
                  </h3>
                  <p className="text-sm text-yellow-700 mb-3">
                    Please complete your profile with bio, skills, and experience to get personalized
                    recommendations.
                  </p>
                  <Button
                    onClick={() => router.push("/profile")}
                    size="sm"
                    className="bg-yellow-600 hover:bg-yellow-700"
                  >
                    Complete Profile
                  </Button>
                </div>
              </div>
            </div>
          )}

          {profileStatus && profileStatus.has_profile && !profileStatus.has_embedding && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-800 mb-1">
                    Generate AI Profile
                  </h3>
                  <p className="text-sm text-blue-700 mb-3">
                    Generate your AI profile to get personalized job recommendations.
                  </p>
                  <Button
                    onClick={generateEmbedding}
                    disabled={generatingEmbedding}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {generatingEmbedding ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate AI Profile"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <AlertCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-700">{error}</p>
                  {error.includes("Profile") && error.includes("complete") && (
                    <Button
                      onClick={() => router.push("/profile")}
                      size="sm"
                      className="mt-3 bg-red-600 hover:bg-red-700"
                    >
                      Go to Profile
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          {profileStatus?.has_embedding && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Search by Title or Company
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="e.g., React Developer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Filter by Location
                </label>
                <input
                  type="text"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="e.g., Remote, San Francisco"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Number of Results
                </label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="5">5 jobs</option>
                  <option value="10">10 jobs</option>
                  <option value="20">20 jobs</option>
                  <option value="50">50 jobs</option>
                </select>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loadingJobs && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-accent mb-4" />
              <p className="text-muted-foreground">
                AI is analyzing your profile and finding the best matches...
              </p>
            </div>
          )}

          {/* Jobs List */}
          {!loadingJobs && profileStatus?.has_embedding && (
            <div className="space-y-4">
              {filteredJobs.length > 0 ? (
                filteredJobs.map((job) => (
                  <div
                    key={job.job_id}
                    className="border border-border rounded-lg p-6 hover:shadow-md transition"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-primary">
                          {job.title}
                        </h3>
                        <p className="text-muted-foreground">{job.company}</p>
                      </div>
                      <div className="text-right">
                        <div className="bg-accent text-white px-3 py-1 rounded-full text-sm font-bold mb-2">
                          {job.match_percentage.toFixed(0)}% Match
                        </div>
                        <button
                          onClick={() => toggleSaveJob(job.job_id.toString())}
                          className={`text-2xl ${
                            savedJobs.includes(job.job_id.toString())
                              ? "text-accent"
                              : "text-gray-300"
                          }`}
                        >
                          ♥
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Location:</span>
                        <p className="font-medium text-foreground">
                          {job.location}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Salary:</span>
                        <p className="font-medium text-foreground">
                          {formatSalary(job.salary_from, job.salary_to)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <p className="font-medium text-foreground capitalize">
                          {job.type}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Match Score:</span>
                        <p className="font-medium text-foreground">
                          {job.similarity_score.toFixed(4)}
                        </p>
                      </div>
                    </div>

                    {/* AI Explanation */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <p className="text-sm font-medium text-blue-900 mb-1">
                        🤖 Why this is a good match:
                      </p>
                      <p className="text-sm text-blue-800">{job.explanation}</p>
                    </div>

                    <p className="text-foreground mb-4 line-clamp-3">
                      {job.description}
                    </p>

                    <div className="mb-4">
                      <p className="text-sm font-medium text-foreground mb-2">
                        Requirements:
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {job.requirements}
                      </p>
                    </div>

                    <Button className="bg-accent hover:bg-accent/90">
                      Apply Now
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    No jobs found matching your criteria
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Back Button */}
          <div className="mt-8 pt-8 border-t border-border">
            <Button
              onClick={() => router.push("/job-search")}
              variant="outline"
              className="w-full"
            >
              Back to Job Search
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
