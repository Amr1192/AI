"use client";
import { useEffect, useState } from "react";
import { authService } from "@/lib/authService";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";
import {
  Users,
  Building2,
  Briefcase,
  Plus,
  Edit,
  Trash2,
  UserPlus,
  Sparkles,
  ArrowLeft,
  Search,
} from "lucide-react";

export default function AdminDashboard() {
  const router = useRouter();
  const { toast } = useToast();

  const [users, setUsers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"add" | "edit">("add");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "user",
    password: "",
    password_confirmation: "",
  });

  // =============================
  // 🔹 FETCH USER DATA
  // =============================
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authService.getCurrentUser();
        setUser(userData);
      } catch (error) {
        console.error("Failed to fetch user:", error);
      }
    };

    fetchUser();
  }, []);

  // =============================
  // 🔹 FETCH DASHBOARD DATA
  // =============================
  useEffect(() => {
    const fetchData = async () => {
      try {
        const usersRes = await authService.getAllUsers();
        const companiesRes = await authService.getAllCompanies();
        const jobsRes = await authService.getAllJobs();

        setUsers(Array.isArray(usersRes) ? usersRes : usersRes.data ?? []);
        setCompanies(
          Array.isArray(companiesRes) ? companiesRes : companiesRes.data ?? []
        );
        setJobs(
          Array.isArray(jobsRes.data) ? jobsRes.data : jobsRes.data?.data ?? []
        );
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load dashboard data.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [toast]);

  // =============================
  // 🔹 DELETE USER
  // =============================
  const handleDeleteUser = async (id: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      await authService.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast({
        title: "Success",
        description: "User deleted successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete user.",
        variant: "destructive",
      });
    }
  };

  // =============================
  // 🔹 OPEN ADD OR EDIT FORM
  // =============================
  const handleOpenForm = (type: "add" | "edit", user?: any) => {
    setFormType(type);
    setShowForm(true);
    if (type === "edit" && user) {
      setSelectedUser(user);
      setFormData({
        name: user.name,
        email: user.email,
        role: user.role,
        password: "",
        password_confirmation: "",
      });
    } else {
      setSelectedUser(null);
      setFormData({
        name: "",
        email: "",
        role: "user",
        password: "",
        password_confirmation: "",
      });
    }
  };

  // =============================
  // 🔹 SUBMIT FORM (ADD / EDIT)
  // =============================
  const handleSubmit = async (e: any) => {
    e.preventDefault();
    try {
      if (formType === "add") {
        const res = await authService.addUser(formData);
        const newUser = res.user || res.data?.user;
        setUsers((prev) => [...prev, newUser]);
        toast({
          title: "User Added",
          description: "User has been added successfully.",
        });
      } else if (formType === "edit" && selectedUser) {
        const res = await authService.updateUser(selectedUser.id, formData);
        const updatedUser = res.user || res.data?.user;
        setUsers((prev) =>
          prev.map((u) => (u.id === selectedUser.id ? updatedUser : u))
        );
        toast({
          title: "User Updated",
          description: res.message || "User updated successfully.",
        });
      }
      setShowForm(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error?.response?.data?.message || "Failed to save user data.",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading)
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full animate-pulse">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <p className="text-xl text-purple-600 font-medium animate-pulse">
            Loading dashboard...
          </p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 right-10 w-64 h-64 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-[pulse_4s_ease-in-out_infinite]"></div>
        <div className="absolute top-40 left-20 w-72 h-72 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-[pulse_5s_ease-in-out_infinite_2s]"></div>
        <div className="absolute bottom-20 right-1/3 w-96 h-96 bg-purple-50 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-[pulse_6s_ease-in-out_infinite_3s]"></div>
      </div>

      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center mb-6">
            <div className="bg-gradient-to-br from-purple-400 to-purple-600 p-3 rounded-2xl shadow-lg">
              <Users className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-5xl font-bold text-primary mb-4">
            Admin Dashboard
          </h1>

          <p className="text-gray-600 text-lg">
            Manage users, companies, and jobs
          </p>
        </motion.div>

        {/* 📊 Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
        >
          {/* Users Card */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 300 }}
            className="group relative"
          >
            <div className="absolute -inset-0.5 bg-gradient-to-br from-purple-400 to-purple-600 rounded-3xl opacity-0 group-hover:opacity-60 blur transition duration-500"></div>
            <Card className="relative bg-white/95 border border-purple-100 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-[#0f0f2e] p-3 rounded-xl shadow-lg">
                  <Users className="w-6 h-6 text-white" />
                </div>

                <div className="text-right">
                  <p className="text-sm text-gray-500">Total Users</p>
                  <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-purple-400 to-purple-600">
                    {users.length}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Companies Card */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 300 }}
            className="group relative cursor-pointer"
            onClick={() => router.push("/admin/companies")}
          >
            <div className="absolute -inset-0.5 bg-gradient-to-br from-purple-400 to-purple-600 rounded-3xl opacity-0 group-hover:opacity-60 blur transition duration-500"></div>
            <Card className="relative bg-white/95 border border-purple-100 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-[#0f0f2e] p-3 rounded-xl shadow-lg">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Total Companies</p>
                  <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-purple-400 to-purple-600">
                    {companies.length}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Jobs Card */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 300 }}
            className="group relative cursor-pointer"
            onClick={() => router.push("/admin/jobs")}
          >
            <div className="absolute -inset-0.5 bg-gradient-to-br from-purple-400 to-purple-600 rounded-3xl opacity-0 group-hover:opacity-60 blur transition duration-500"></div>
            <Card className="relative bg-white/95 border border-purple-100 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-[#0f0f2e] p-3 rounded-xl shadow-lg">
                  <Briefcase className="w-6 h-6 text-white" />
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Total Jobs</p>
                  <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-purple-400 to-purple-600">
                    {jobs.length}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>

        {/* 👥 Users Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-white/90 backdrop-blur-lg border border-purple-200 rounded-3xl shadow-xl p-8">
            <CardHeader className="p-0 mb-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-[#0f0f2e] p-2 rounded-xl shadow-lg">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-3xl font-bold text-primary bg-clip-text bg-gradient-to-br from-purple-400 to-purple-600">
                    Users Management
                  </h2>
                </div>
                <Button
                  onClick={() => handleOpenForm("add")}
                  className="bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border-0 flex items-center gap-2"
                >
                  <UserPlus className="w-5 h-5" />
                  Add User
                </Button>
              </div>

              {/* Search */}
              <div className="flex flex-col sm:flex-row gap-4 mt-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    type="text"
                    placeholder="Search users by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white/80 backdrop-blur-lg border-purple-200 rounded-xl focus:border-purple-400 focus:ring-purple-400"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="space-y-4">
                {Array.isArray(filteredUsers) && filteredUsers.length > 0 ? (
                  filteredUsers.map((user, index) => (
                    <motion.div
                      key={user.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onMouseEnter={() => setHoveredCard(String(user.id))}
                      onMouseLeave={() => setHoveredCard(null)}
                      className="group relative"
                    >
                      {/* Card glow effect */}
                      <div
                        className={`absolute -inset-0.5 bg-gradient-to-br from-purple-400 to-purple-600 rounded-2xl opacity-0 group-hover:opacity-60 blur transition duration-500`}
                      ></div>

                      {/* Main card */}
                      <Card className="relative bg-white border border-purple-100 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 p-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div className="flex items-center gap-4">
                            <div className="bg-[#0f0f2e] p-3 rounded-xl shadow-lg">
                              <Users className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800 text-lg">
                                {user.name}
                              </p>
                              <p className="text-gray-600 text-sm">
                                {user.email}
                              </p>
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-1 ${
                                  user.role === "admin"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {user.role}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {/* <Button
                              onClick={() => handleOpenForm("edit", user)}
                              size="sm"
                              className="bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white px-4 py-2 rounded-lg font-medium shadow-lg hover:shadow-xl transition-all duration-300 border-0 flex items-center gap-1"
                            >
                              <Edit className="w-4 h-4" />
                              Edit
                            </Button> */}
                            <Button
                              onClick={() => handleDeleteUser(user.id)}
                              size="sm"
                              className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white px-4 py-2 rounded-lg font-medium shadow-lg hover:shadow-xl transition-all duration-300 border-0 flex items-center gap-1"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                      <Users className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 text-lg">No users found.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8"
        >
          <Button
            onClick={() => router.push("/")}
            className="bg-gradient-to-br from-purple-400 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Home Page
          </Button>
        </motion.div>
      </div>

      {/* 🔹 Dialog for Add/Edit User */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white border border-purple-100 shadow-2xl max-w-2xl w-full rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-6 border-b border-purple-100">
            <DialogTitle className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-purple-400 to-purple-600 flex items-center gap-3">
              <div className="bg-gradient-to-br from-purple-400 to-purple-600 p-2 rounded-xl shadow-lg">
                <UserPlus className="w-6 h-6 text-white" />
              </div>
              {formType === "add" ? "Add New User" : "Edit User"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-600" />
                Name
              </label>
              <Input
                type="text"
                placeholder="Enter user name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="bg-white/80 backdrop-blur-lg border-purple-200 rounded-xl focus:border-purple-400 focus:ring-purple-400"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Edit className="w-4 h-4 text-purple-600" />
                Email
              </label>
              <Input
                type="email"
                placeholder="Enter email address"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="bg-white/80 backdrop-blur-lg border-purple-200 rounded-xl focus:border-purple-400 focus:ring-purple-400"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                Role
              </label>
              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value })
                }
                className="w-full bg-white/80 backdrop-blur-lg border-purple-200 rounded-xl focus:border-purple-400 focus:ring-purple-400 p-3"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Edit className="w-4 h-4 text-purple-600" />
                Password
              </label>
              <Input
                type="password"
                placeholder={
                  formType === "edit"
                    ? "Leave blank to keep current password"
                    : "Enter password"
                }
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                className="bg-white/80 backdrop-blur-lg border-purple-200 rounded-xl focus:border-purple-400 focus:ring-purple-400"
                required={formType === "add"}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Edit className="w-4 h-4 text-purple-600" />
                Confirm Password
              </label>
              <Input
                type="password"
                placeholder="Confirm password"
                value={formData.password_confirmation}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    password_confirmation: e.target.value,
                  })
                }
                className="bg-white/80 backdrop-blur-lg border-purple-200 rounded-xl focus:border-purple-400 focus:ring-purple-400"
                required={formType === "add"}
              />
            </div>

            <div className="flex gap-4 pt-4 border-t border-purple-100">
              <Button
                type="submit"
                className="flex-1 bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border-0"
              >
                {formType === "add" ? "Add User" : "Update User"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
                className="flex-1 border-2 border-purple-200 text-purple-700 px-6 py-3 rounded-xl font-semibold hover:border-purple-400 hover:text-purple-900 transition-all duration-300 shadow-lg hover:shadow-xl"
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