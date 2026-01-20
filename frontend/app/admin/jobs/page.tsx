// ===============================
// 🟢 RELEVANT USERS PAGE   Before  using gen ai *****************************************************
// ===============================
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import DashboardNav from "@/components/dashboard-nav";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";
import {
  Briefcase,
  Search,
  MapPin,
  DollarSign,
  Calendar,
  Clock,
  Building2,
  Edit,
  Trash2,
  Plus,
  Sparkles,
  Filter,
} from "lucide-react";
import { authService } from "@/lib/authService";

interface User {
  id: number;
  name: string;
  email: string;
  role?: string;
}

interface Job {
  id: number;
  title: string;
  company: string;
  company_id?: number;
  location: string;
  salary: string;
  description: string;
  requirements: string[];
  type?: string;
  deadline?: string;
  is_active?: boolean;
}

interface Company {
  id: number;
  name: string;
}

export default function JobSearchPage() {
  const { toast } = useToast();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [savedJobs, setSavedJobs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAI, setLoadingAI] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  // FORM
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"add" | "edit">("add");
  const [selectedJob, setSelectedJob] = useState<any>(null);

  const [formData, setFormData] = useState({
    company_id: "",
    title: "",
    description: "",
    requirements: "",
    location: "",
    type: "",
    salary_from: "",
    salary_to: "",
    deadline: "",
    is_active: "",
  });

  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // =============================
  // 🟢 INITIAL LOAD
  // =============================
  useEffect(() => {
    const userData = localStorage.getItem("cvmaster_user");
    if (!userData) {
      router.push("/login");
      return;
    }

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);

    if (parsedUser.role !== "admin") {
      router.push("/dashboard");
      return;
    }

    const saved = localStorage.getItem("cvmaster_saved_jobs");
    if (saved) setSavedJobs(JSON.parse(saved));

    const loadData = async () => {
      await fetchCompanies();
      await fetchJobs();
    };

    loadData();
  }, []);

  // =============================
  // 🟢 FETCH COMPANIES
  // =============================
  const fetchCompanies = async () => {
    try {
      const res = await authService.getAllCompanies();
      let companiesArray: any[] = [];

      if (Array.isArray(res)) companiesArray = res;
      else if (res.data && Array.isArray(res.data)) companiesArray = res.data;

      const formatted = companiesArray.map((c: any) => ({
        id: c.id,
        name: c.name || "Unnamed Company",
      }));

      setCompanies(formatted);

      if (formatted.length === 0) {
        toast({
          title: "Warning",
          description: "No companies found. Please create companies first.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("Companies error:", err);
      toast({
        title: "Error",
        description: "Failed to load companies",
        variant: "destructive",
      });
    }
  };
  const handleGenerateAI = async () => {
    if (!formData.title) {
      toast({ title: "Job title is required", variant: "destructive" });
      return;
    }

    try {
      setLoadingAI(true);
      const res = await authService.generateJobDescription({
        title: formData.title,
        requirements: formData.requirements,
        type: formData.type,
        location: formData.location,
        // 🔥 RULES واضحة للـ AI
        rules: `
    Write a professional job description of about 5 short sentences.
    Do NOT mention:
    - Company
    - Benefits
    - Requirements
    - Salary
    - Location
    - Job Type
    - Application process
    Focus only on Job Description.
  `,

        // rules: `
        // Write a professional job description of about 15 short lines.
        // Do NOT mention:
        // - benefits
        // - Requirements
        // - company details
        // - Job Title
        // - location
        // - salary
        // - Job type
        // - application process
        // - Key Responsibilities
        // Focus only on Job Description .
        // `,
      });

      setFormData((prev) => ({
        ...prev,
        description: res.description,
      }));

      toast({ title: "Description generated ✨" });
    } catch {
      toast({
        title: "AI generation failed",
        variant: "destructive",
      });
    } finally {
      setLoadingAI(false);
    }
  };

  // =============================
  // 🟢 FETCH JOBS
  // =============================
  const fetchJobs = async () => {
    try {
      const res = await authService.getAllJobs();
      const jobsArray = res.data?.data || res.data || [];

      const formattedJobs: Job[] = jobsArray.map((job: any) => ({
        id: job.id,
        title: job.title,
        company: job.company?.name || "Unknown",
        company_id: job.company_id,
        location: job.location,
        salary: `${job.salary_from ?? ""} - ${job.salary_to ?? ""}`,
        description: job.description,
        requirements: job.requirements
          ? job.requirements.split(",").map((r: string) => r.trim())
          : [],
        type: job.type,
        deadline: job.deadline,
        is_active: job.is_active === 1 || job.is_active === true,
      }));

      setJobs(formattedJobs);
      setFilteredJobs(formattedJobs);
    } catch (error) {
      console.error("Jobs error:", error);
    } finally {
      setLoading(false);
    }
  };

  // =============================
  // 🟢 FILTER LOGIC
  // =============================
  useEffect(() => {
    let filtered = jobs;

    if (searchTerm) {
      filtered = filtered.filter(
        (j) =>
          j.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          j.company.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (locationFilter) {
      filtered = filtered.filter((j) =>
        j.location.toLowerCase().includes(locationFilter.toLowerCase())
      );
    }

    setFilteredJobs(filtered);
  }, [searchTerm, locationFilter, jobs]);

  // =============================
  // 🟢 OPEN ADD / EDIT FORM
  // =============================
  const handleOpenForm = (type: "add" | "edit", job?: any) => {
    setFormType(type);
    setShowForm(true);

    if (type === "edit" && job) {
      setSelectedJob(job);

      const salaryParts = job.salary.split(" - ");

      setFormData({
        company_id: job.company_id ? String(job.company_id) : "",
        title: job.title,
        description: job.description,
        requirements: job.requirements.join(", "),
        location: job.location,
        type: job.type || "",
        salary_from: salaryParts[0],
        salary_to: salaryParts[1],
        deadline: job.deadline || "",
        is_active: job.is_active ? "true" : "false",
      });
    } else {
      setSelectedJob(null);
      setFormData({
        company_id: "",
        title: "",
        description: "",
        requirements: "",
        location: "",
        type: "",
        salary_from: "",
        salary_to: "",
        deadline: "",
        is_active: "",
      });
    }
  };

  // =============================
  // 🟢 HANDLE ADD / EDIT JOBS
  // =============================
  const handleSubmit = async (e: any) => {
    e.preventDefault();

    const payload: any = {
      company_id: Number(formData.company_id),
      title: formData.title,
      description: formData.description,
      requirements: formData.requirements,
      location: formData.location,
      type: formData.type || undefined,
      salary_from: formData.salary_from || undefined,
      salary_to: formData.salary_to || undefined,
      deadline: formData.deadline || undefined,
      is_active:
        formData.is_active === "true"
          ? 1
          : formData.is_active === "false"
          ? 0
          : undefined,
    };

    Object.keys(payload).forEach((k) => {
      if (payload[k] === "" || payload[k] === undefined) delete payload[k];
    });

    try {
      let jobRes: any;

      if (formType === "add") {
        const res = await authService.createJob(payload);
        jobRes = res.job ?? res.data?.job ?? res.data;
      }

      if (formType === "edit" && selectedJob) {
        const res = await authService.updateJob(selectedJob.id, payload);
        jobRes = res.job ?? res.data?.job ?? res.data;
      }

      if (!jobRes) throw new Error("No job data returned from API");

      const newJob: Job = {
        id: jobRes.id,
        title: jobRes.title,
        company:
          jobRes.company?.name ||
          findCompanyName(jobRes.company_id) ||
          "Unknown",
        company_id: jobRes.company_id,
        location: jobRes.location,
        salary: `${jobRes.salary_from ?? ""} - ${jobRes.salary_to ?? ""}`,
        description: jobRes.description,
        requirements: jobRes.requirements
          ? jobRes.requirements.split(",").map((r: string) => r.trim())
          : [],
        type: jobRes.type,
        deadline: jobRes.deadline,
        is_active: jobRes.is_active === 1 || jobRes.is_active === true,
      };

      if (formType === "add") {
        setJobs((prev) => [...prev, newJob]);
        setFilteredJobs((prev) => [...prev, newJob]);
      } else {
        setJobs((prev) =>
          prev.map((j) => (j.id === selectedJob.id ? newJob : j))
        );
        setFilteredJobs((prev) =>
          prev.map((j) => (j.id === selectedJob.id ? newJob : j))
        );
      }

      setShowForm(false);
      toast({ title: "Success", description: "Job saved successfully" });
    } catch (err: any) {
      console.error("save error:", err);

      let message = "Failed to save job";

      try {
        if (!err) {
          message = "Unknown error";
        } else if (err.errors && typeof err.errors === "object") {
          const msgs = Object.values(err.errors)
            .flat()
            .map((m: any) => String(m))
            .join(" ");
          message = msgs || message;
        } else if (err.message) {
          message = String(err.message);
        } else if (err?.data) {
          message = JSON.stringify(err.data);
        } else if (typeof err === "string") {
          message = err;
        }
      } catch (parseErr) {
        console.error("Error parsing API error:", parseErr);
      }

      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    }
  };

  const findCompanyName = (id?: number) => {
    return companies.find((c) => c.id === id)?.name;
  };

  // =============================
  // 🟢 HANDLE DELETE JOB
  // =============================
  const handleDeleteJob = async (id: number) => {
    if (!confirm("Are you sure you want to delete this job?")) return;

    try {
      await authService.deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      setFilteredJobs((prev) => prev.filter((j) => j.id !== id));
      toast({ title: "Success", description: "Job deleted successfully" });
    } catch (err: any) {
      console.error("Delete error:", err);
      toast({
        title: "Error",
        description: err?.message || "Failed to delete job",
        variant: "destructive",
      });
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-white relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-[pulse_6s_ease-in-out_infinite]"></div>
          <div className="absolute top-40 right-10 w-72 h-72 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-[pulse_6s_ease-in-out_infinite_2s]"></div>
          <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-purple-50 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-[pulse_6s_ease-in-out_infinite_4s]"></div>
        </div>

        <div className="flex items-center justify-center h-screen relative z-10">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full">
              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-xl font-semibold text-primary">
              Loading Jobs...
            </p>
          </div>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-[pulse_6s_ease-in-out_infinite]"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-[pulse_6s_ease-in-out_infinite_2s]"></div>
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-purple-50 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-[pulse_6s_ease-in-out_infinite_4s]"></div>
      </div>

      <DashboardNav user={user!} />

      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-12 gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-purple-400 to-purple-600 p-3 rounded-2xl shadow-lg">
              <Briefcase size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-5xl font-bold text-primary">Jobs</h1>
              <p className="text-slate-600 mt-1">
                Manage job listings and opportunities
              </p>
            </div>
          </div>

          <Button
            onClick={() => handleOpenForm("add")}
            className="group relative bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white px-6 py-3 rounded-2xl font-semibold shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 flex items-center gap-2 border-0"
          >
            <Plus size={20} />
            <span>Add New Job</span>
            <Sparkles
              size={16}
              className="absolute -top-1 -right-1 text-yellow-300 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </Button>
        </div>

        {/* Filters Section */}
        <Card className="bg-white/90 backdrop-blur-lg border border-purple-200 rounded-3xl shadow-xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-purple-100 p-2 rounded-lg">
              <Filter size={20} className="text-purple-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800">
              Filter Jobs
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                size={20}
              />
              <Input
                placeholder="Search title or company..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              />
            </div>

            <div className="relative">
              <MapPin
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                size={20}
              />
              <Input
                placeholder="Filter by location..."
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="pl-10 bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              />
            </div>
          </div>
        </Card>

        {/* Jobs Grid/List */}
        <div className="space-y-6">
          {filteredJobs.map((job, index) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onMouseEnter={() => setHoveredCard(String(job.id))}
              onMouseLeave={() => setHoveredCard(null)}
              className="group relative"
            >
              {/* Card glow effect */}
              <div
                className={`absolute -inset-0.5 bg-gradient-to-br from-purple-400 to-purple-600 rounded-3xl opacity-0 group-hover:opacity-60 blur transition duration-500`}
              ></div>

              {/* Main card */}
              <Card className="relative bg-white/90 backdrop-blur-lg border border-purple-200 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 p-6">
                <CardHeader className="p-0 mb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-slate-800 mb-2 flex items-center gap-2">
                        <span className="bg-gradient-to-br from-purple-400 to-purple-600 w-2 h-2 rounded-full animate-pulse"></span>
                        {job.title}
                      </h3>
                      <div className="flex items-center gap-2 text-slate-600 mb-3">
                        <Building2 size={16} className="text-purple-600" />
                        <span className="font-medium">{job.company}</span>
                      </div>
                      <div className="h-1 w-16 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full"></div>
                    </div>

                    {/* Status Badge */}
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        job.is_active
                          ? "bg-green-100 text-green-700 border border-green-200"
                          : "bg-red-100 text-red-700 border border-red-200"
                      }`}
                    >
                      {job.is_active ? "Active" : "Inactive"}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  {/* Job Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border border-purple-100">
                      <MapPin size={18} className="text-purple-600" />
                      <div>
                        <p className="text-xs text-slate-500">Location</p>
                        <p className="text-sm font-medium text-slate-800">
                          {job.location}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
                      <DollarSign size={18} className="text-green-600" />
                      <div>
                        <p className="text-xs text-slate-500">Salary</p>
                        <p className="text-sm font-medium text-slate-800">
                          {job.salary}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                      <Calendar size={18} className="text-blue-600" />
                      <div>
                        <p className="text-xs text-slate-500">Deadline</p>
                        <p className="text-sm font-medium text-slate-800">
                          {job.deadline
                            ? new Date(job.deadline).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
                      <Clock size={18} className="text-orange-600" />
                      <div>
                        <p className="text-xs text-slate-500">Type</p>
                        <p className="text-sm font-medium text-slate-800">
                          {job.type || "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Description and Requirements */}
                  <div className="space-y-3 mb-6">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-sm font-medium text-slate-700 mb-1">
                        Description
                      </p>

                      <p className="text-slate-600 text-sm">
                        {job.description}
                      </p>
                    </div>

                    <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                      <p className="text-sm font-medium text-slate-700 mb-2">
                        Requirements
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {job.requirements.length > 0 ? (
                          job.requirements.map((req, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 bg-purple-200 text-purple-800 text-xs rounded-full font-medium"
                            >
                              {req}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 text-sm italic">
                            No requirements specified
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3">
                    <Button
                      size="sm"
                      onClick={() => handleOpenForm("edit", job)}
                      // className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border-0"
                      className="flex-1 flex items-center justify-center gap-2 bg-[#1a1a3e] hover:bg-[#141432] text-white px-4 py-2.5 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border-0"
                    >
                      <Edit size={16} />
                      Edit
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => handleDeleteJob(job.id)}
                      className="flex-1 bg-red-600 text-white px-6 py-3 rounded-xl font-semibold 
hover:bg-red-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      <Trash2 size={16} />
                      Delete
                    </Button>
                    <Button
                      onClick={() =>
                        router.push("/admin/relevant-users?job_id=" + job.id)
                      }
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 text-lg"
                    >
                      ⭐ View Relevant Users
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Back button */}
        <div className="mt-12">
          <Button
            onClick={() => router.push("/dashboard")}
            className="w-full bg-gradient-to-br from-purple-400 to-purple-600 text-white py-4 rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 text-lg"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>

      {/* FORM - Modern Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white border border-purple-100 shadow-2xl max-w-2xl w-full rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-6 border-b border-purple-100">
            <DialogTitle className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-purple-400 to-purple-600 flex items-center gap-3">
              <div className="bg-gradient-to-br from-purple-400 to-purple-600 p-2 rounded-xl shadow-lg">
                <Briefcase size={24} className="text-white" />
              </div>
              {formType === "add" ? "Add New Job" : "Edit Job"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6 p-6">
            {/* Company Selection */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Building2 size={16} className="text-purple-600" />
                Company
              </label>
              <select
                className="w-full px-4 py-3 bg-purple-50 border-2 border-purple-200 text-slate-800 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                value={formData.company_id}
                onChange={(e) =>
                  setFormData({ ...formData, company_id: e.target.value })
                }
                required
              >
                <option value="">Select a company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Job Title */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Briefcase size={16} className="text-purple-600" />
                Job Title
              </label>
              <Input
                placeholder="Enter job title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                required
                className="bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              {/* Label + AI Button */}
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Sparkles size={16} className="text-purple-600" />
                  Description
                </label>

                <Button
                  type="button"
                  onClick={handleGenerateAI}
                  disabled={loadingAI}
                  // className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 text-lg"
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-1.5 px-4 rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 text-sm"

                  // className="text-sm px-4 py-2"
                >
                  {loadingAI
                    ? "Generating..."
                    : "✨ "}
                </Button>
              </div>
              {/* Text Area*/}
              <Textarea
                placeholder="Describe the job role and responsibilities"
                rows={4}
                value={formData.description}
                required
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none"
              />
            </div>

            {/* Requirements */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Sparkles size={16} className="text-purple-600" />
                Requirements
              </label>
              <Input
                placeholder="Enter requirements separated by commas"
                value={formData.requirements}
                onChange={(e) =>
                  setFormData({ ...formData, requirements: e.target.value })
                }
                className="bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              />
            </div>

            {/* Location */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <MapPin size={16} className="text-purple-600" />
                Location
              </label>
              <Input
                placeholder="Job location (e.g., New York, Remote)"
                value={formData.location}
                onChange={(e) =>
                  setFormData({ ...formData, location: e.target.value })
                }
                className="bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              />
            </div>

            {/* Salary Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <DollarSign size={16} className="text-purple-600" />
                  Salary From
                </label>
                <Input
                  placeholder="Min salary"
                  value={formData.salary_from}
                  onChange={(e) =>
                    setFormData({ ...formData, salary_from: e.target.value })
                  }
                  className="bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <DollarSign size={16} className="text-purple-600" />
                  Salary To
                </label>
                <Input
                  placeholder="Max salary"
                  value={formData.salary_to}
                  onChange={(e) =>
                    setFormData({ ...formData, salary_to: e.target.value })
                  }
                  className="bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                />
              </div>
            </div>

            {/* Deadline and Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Calendar size={16} className="text-purple-600" />
                  Deadline
                </label>
                <Input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) =>
                    setFormData({ ...formData, deadline: e.target.value })
                  }
                  className="bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Clock size={16} className="text-purple-600" />
                  Type
                </label>
                <Input
                  placeholder="Full-time, Part-time, Contract"
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  className="bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Sparkles size={16} className="text-purple-600" />
                Status
              </label>
              <select
                className="w-full px-4 py-3 bg-purple-50 border-2 border-purple-200 text-slate-800 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                value={formData.is_active}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.value })
                }
              >
                <option value="">Select status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>

            {/* Form Actions */}
            <div className="flex gap-4 pt-4 border-t border-purple-100">
              <Button
                type="submit"
                className="flex-1 bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border-0"
              >
                {formType === "add" ? "Add Job" : "Update Job"}
              </Button>
              <Button
                type="button"
                onClick={() => setShowForm(false)}
                // className="flex-1 border-2 border-purple-200 text-purple-700 px-6 py-3 rounded-xl font-semibold hover:border-purple-400 hover:text-purple-900 transition-all duration-300 shadow-lg hover:shadow-xl"
                className="flex-1 bg-red-600 text-white px-6 py-3 rounded-xl font-semibold 
hover:bg-red-700 transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}