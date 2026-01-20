// ========================= End of code =========================
// ===================== View copmpanies with new theme========================
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
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
import DashboardNav from "@/components/dashboard-nav";
import { authService } from "@/lib/authService";
import { motion } from "framer-motion";
import {
  Globe,
  MapPin,
  Edit,
  Trash2,
  Plus,
  Building2,
  Sparkles,
  X,
} from "lucide-react";

export default function CompaniesPage() {
  const { toast } = useToast();
  const router = useRouter();

  const [user, setUser] = useState<any | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"add" | "edit">("add");
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    location: "",
    description: "",
    website: "",
    logo: null as File | string | null,
  });

  const [errors, setErrors] = useState({ name: "", website: "" });

  const fetchCompanies = async () => {
    try {
      const res = await authService.getAllCompanies();
      const dataArray = Array.isArray(res) ? res : [];
      setCompanies(dataArray.map((c: any) => ({ ...c, _key: c.id })));
    } catch {
      toast({
        title: "Error",
        description: "Failed to load companies",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const userData = localStorage.getItem("cvmaster_user");
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setUser(parsed);
      } catch {
        setUser(null);
      }
    }
    fetchCompanies();
  }, []);

  const openForm = (type: "add" | "edit", company?: any) => {
    setFormType(type);
    setShowForm(true);
    setErrors({ name: "", website: "" });

    if (type === "edit" && company) {
      setSelectedCompany(company);
      setFormData({
        name: company.name || "",
        location: company.location || "",
        description: company.description || "",
        website: company.website || "",
        logo: company.logo || null,
      });
    } else {
      setSelectedCompany(null);
      setFormData({
        name: "",
        location: "",
        description: "",
        website: "",
        logo: null,
      });
    }
  };

  const checkDuplicate = (field: "name" | "website", value: string) => {
    const exists = companies.some(
      (c) =>
        c[field].toLowerCase() === value.toLowerCase() &&
        (formType === "add" || c.id !== selectedCompany?.id)
    );
    setErrors((prev) => ({
      ...prev,
      [field]: exists ? `${field} already exists` : "",
    }));
    return exists;
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    const hasNameError = checkDuplicate("name", formData.name);
    const hasWebsiteError = checkDuplicate("website", formData.website);
    if (hasNameError || hasWebsiteError) return;

    let payload: any;

    if (formData.logo instanceof File) {
      const fd = new FormData();
      fd.append("name", formData.name);
      fd.append("location", formData.location);
      fd.append("description", formData.description);
      fd.append("website", formData.website);
      fd.append("logo", formData.logo);
      payload = fd;
    } else {
      payload = {
        name: formData.name,
        location: formData.location,
        description: formData.description,
        website: formData.website,
      };
    }

    try {
      if (formType === "add") {
        const res = await authService.createCompany(payload);
        const newCompany = res.company ?? res;
        setCompanies((prev) => [
          ...prev,
          { ...newCompany, _key: newCompany.id },
        ]);
        toast({ title: "Success", description: "Company added successfully" });
      } else {
        const res = await authService.updateCompany(
          selectedCompany.id,
          payload
        );
        const updatedCompany = res.company ?? res;
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === selectedCompany.id
              ? { ...updatedCompany, _key: updatedCompany.id }
              : c
          )
        );
        toast({
          title: "Updated",
          description: "Company updated successfully",
        });
      }

      setShowForm(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed saving company",
        variant: "destructive",
      });
    }
  };

  const deleteCompany = async (id: number) => {
    if (!confirm("Are you sure?")) return;

    try {
      await authService.deleteCompany(id);
      setCompanies((prev) => prev.filter((c) => c.id !== id));
      toast({ title: "Deleted", description: "Company deleted" });
    } catch {
      toast({
        title: "Error",
        description: "Failed deleting company",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-[pulse_6s_ease-in-out_infinite]"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-[pulse_6s_ease-in-out_infinite_2s]"></div>
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-purple-50 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-[pulse_6s_ease-in-out_infinite_4s]"></div>
      </div>

      <DashboardNav user={user} />

      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-12 gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-purple-400 to-purple-600 p-3 rounded-2xl shadow-lg">
              <Building2 size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-5xl font-bold text-primary">Companies</h1>
              <p className="text-slate-600 mt-1">
                Manage your company portfolio
              </p>
            </div>
          </div>

          <Button
            onClick={() => openForm("add")}
            className="group relative bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white px-6 py-3 rounded-2xl font-semibold shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 flex items-center gap-2 border-0"
          >
            <Plus size={20} />
            <span>Add Company</span>
            <Sparkles
              size={16}
              className="absolute -top-1 -right-1 text-yellow-300 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </Button>
        </div>

        {/* Companies Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {companies?.map((c, index) => (
            <motion.div
              key={c._key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onMouseEnter={() => setHoveredCard(String(c._key))}
              onMouseLeave={() => setHoveredCard(null)}
              className="group relative"
            >
              {/* Card glow effect */}
              <div
                className={`absolute -inset-0.5 bg-gradient-to-br from-purple-400 to-purple-600 rounded-3xl opacity-0 group-hover:opacity-60 blur transition duration-500`}
              ></div>

              {/* Main card */}
              <Card className="relative bg-[#0f0f2e] border border-slate-900 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 p-6 text-white">
                <CardHeader className="p-0 mb-4">
                  <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                    <span className="bg-gradient-to-br from-purple-400 to-purple-600 w-2 h-2 rounded-full animate-pulse"></span>
                    {c.name}
                  </h2>
                  <div className="h-1 w-16 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full"></div>
                </CardHeader>

                <CardContent className="p-0">
                  {/* Company details */}
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-3 text-slate-100">
                      <div className="bg-purple-900/60 p-2 rounded-lg">
                        <MapPin size={16} className="text-purple-300" />
                      </div>
                      <span className="text-sm">{c.location}</span>
                    </div>

                    <div className="flex items-center gap-3 text-slate-100">
                      <div className="bg-purple-900/60 p-2 rounded-lg">
                        <Globe size={16} className="text-purple-200" />
                      </div>
                      <span className="text-sm break-all">{c.website}</span>
                    </div>

                    {c.description && (
                      <p className="text-slate-100 text-sm mt-3 p-3 bg-slate-900/70 rounded-xl border border-slate-700">
                        {c.description}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3 mt-4">
                    <Button
                      size="sm"
                      onClick={() => openForm("edit", c)}
                      className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border-0"
                    >
                      <Edit size={16} />
                      Edit
                    </Button>

                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteCompany(c.id)}
                      className="flex-1 bg-red-600 text-white px-6 py-3 rounded-xl font-semibold 
hover:bg-red-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      <Trash2 size={16} />
                      Delete
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
            variant="outline"
            className="w-full bg-white/80 backdrop-blur-lg border-2 border-purple-300 text-slate-700 py-4 rounded-2xl font-semibold hover:bg-white hover:border-purple-400 transition-all duration-300 shadow-lg hover:shadow-xl text-lg"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>

      {/* Modal/Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white border border-purple-100 rounded-3xl p-8 max-w-md shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-purple-400 to-purple-600 flex justify-between items-center">
              <span>{formType === "add" ? "Add Company" : "Edit Company"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Input
                placeholder="Company Name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  checkDuplicate("name", e.target.value);
                }}
                className="w-full bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                required
              />
              {errors.name && (
                <p className="text-red-600 text-sm mt-1">{errors.name}</p>
              )}
            </div>

            <Input
              placeholder="Location"
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
              className="w-full bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
            />

            <Textarea
              placeholder="Description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none"
              rows={3}
            />

            <div>
              <Input
                placeholder="WebSite:https://example.com"
                value={formData.website}
                onChange={(e) => {
                  setFormData({ ...formData, website: e.target.value });
                  checkDuplicate("website", e.target.value);
                }}
                className="w-full bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder-slate-500 px-4 py-3 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              />
              {errors.website && (
                <p className="text-red-600 text-sm mt-1">{errors.website}</p>
              )}
            </div>

            <Input
              type="file"
              accept="image/*"
              onChange={(e) =>
                setFormData({ ...formData, logo: e.target.files?.[0] || null })
              }
              className="w-full bg-purple-50 border-2 border-purple-200 text-slate-800 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gradient-to-br file:from-purple-400 file:to-purple-600 file:text-white file:cursor-pointer hover:file:opacity-80 px-4 py-3 rounded-xl transition-all"
            />

            <div className="flex gap-4 pt-4">
              <Button
                type="button"
                onClick={handleSubmit}
                className="flex-1 bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border-0"
              >
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(false)}
                // className="flex-1 bg-white border-2 border-purple-300 text-slate-700 py-3 rounded-xl font-semibold hover:bg-purple-50 transition-all duration-300"
     className="flex-1 bg-red-600 text-white px-6 py-3 rounded-xl font-semibold 
hover:bg-red-700 transition-all duration-300 shadow-lg hover:shadow-xl"              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}