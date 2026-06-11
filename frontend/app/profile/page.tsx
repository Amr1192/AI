"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { authService } from "@/lib/authService";
import { API_URL } from "@/lib/api";
import axios from "axios";
import { toast } from "sonner";
import {
  Mail,
  MapPin,
  Briefcase,
  Edit2,
  Save,
  X,
  Plus,
  Phone,
  User,
  Calendar,
} from "lucide-react";

interface User {
  id?: number;
  name?: string;
  email?: string;
}

interface Skill {
  id?: number;
  title?: string;
  years_of_experience?: number;
  proficiency_level?: string;
}

interface Profile {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
  phone_number?: string | null;
  location?: string | null;
  professional_bio?: string | null;
  years_of_experience?: number;
  skills?: Skill[];
}

const fieldClass =
  "h-11 bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder:text-slate-400 rounded-xl focus-visible:ring-purple-500 focus-visible:border-purple-500 disabled:bg-slate-50 disabled:text-slate-600";

function getAuthToken(): string | null {
  return localStorage.getItem("cvmaster_token") || localStorage.getItem("token");
}

function formatSkillError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === "object") {
      const parts = Object.values(data).flatMap((value) =>
        Array.isArray(value) ? value.map(String) : [String(value)]
      );
      if (parts.length > 0) {
        return parts.join(" ");
      }
    }
    return error.message || "Failed to add skill";
  }
  if (error instanceof Error) return error.message;
  return "Failed to add skill";
}

function InfoRow({
  icon: Icon,
  label,
  value,
  empty = "Not set",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | number | null;
  empty?: string;
}) {
  const display =
    value !== undefined && value !== null && String(value).trim() !== ""
      ? String(value)
      : empty;

  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-purple-600 mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p
        className={`text-sm ${
          display === empty ? "text-slate-400 italic" : "text-slate-800 font-medium"
        }`}
      >
        {display}
      </p>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newSkill, setNewSkill] = useState<Skill>({
    title: "",
    years_of_experience: 0,
    proficiency_level: "beginner",
  });

  useEffect(() => {
    const fetchData = async () => {
      const userData = localStorage.getItem("cvmaster_user");
      if (!userData) {
        router.push("/login");
        return;
      }
      setUser(JSON.parse(userData));

      try {
        const profileData = await authService.getProfile();
        setProfile(profileData);
        setSkills(profileData.skills || []);
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const handleAddSkill = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = getAuthToken();
      if (!token) {
        toast.error("Please log in again to add skills");
        return;
      }

      const res = await axios.post(
        `${API_URL}/profile/skills`,
        { skills: [newSkill] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const addedSkills: Skill[] = res.data.skills || [];

      setSkills((prev) => {
        const allSkills = [...prev, ...addedSkills];
        return allSkills.filter(
          (s, index, self) => index === self.findIndex((t) => t.id === s.id)
        );
      });

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              skills: [
                ...(prev.skills || []).filter(
                  (s) => !addedSkills.some((a) => a.id === s.id)
                ),
                ...addedSkills,
              ],
            }
          : prev
      );

      setNewSkill({
        title: "",
        years_of_experience: 0,
        proficiency_level: "beginner",
      });
      setShowForm(false);
      toast.success("Skill added successfully!");
    } catch (error: unknown) {
      console.error("Error adding skill:", error);
      toast.error(formatSkillError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSkill = async (skillId: number) => {
    if (!confirm("Are you sure you want to remove this skill?")) return;
    try {
      const token = getAuthToken();
      await axios.delete(`${API_URL}/profile/skills/${skillId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      setSkills((prev) => prev.filter((skill) => skill.id !== skillId));
      setProfile((prev) =>
        prev
          ? { ...prev, skills: (prev.skills || []).filter((s) => s.id !== skillId) }
          : prev
      );
      toast.success("Skill removed");
    } catch (error: any) {
      console.error("Error removing skill:", error.response?.data || error.message);
      toast.error("Failed to remove skill");
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const updated = await authService.updateProfile({
        phone_number: profile.phone_number,
        location: profile.location,
        professional_bio: profile.professional_bio,
        years_of_experience: profile.years_of_experience,
      });

      setProfile(updated);
      localStorage.setItem("cvmaster_profile", JSON.stringify(updated));
      toast.success("Profile updated successfully!");
      setEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    authService.getProfile().then(setProfile).catch(console.error);
  };

  if (loading || !user || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500" />
      </div>
    );
  }

  const profileSubtitle = [
    profile.location,
    profile.years_of_experience
      ? `${profile.years_of_experience} year${profile.years_of_experience === 1 ? "" : "s"} experience`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30" />
      </div>

      <main className="max-w-4xl mx-auto px-4 py-10 relative z-10">
        {/* Header */}
        <div className="mb-8 bg-white/90 backdrop-blur-lg rounded-3xl p-8 border border-purple-200 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div className="flex items-start gap-4">
              <div className="bg-gradient-to-br from-purple-400 to-purple-600 p-3 rounded-2xl shadow-md shrink-0">
                <User className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-800">{profile.name}</h1>
                <p className="text-slate-500 mt-1">{profile.email}</p>
                {profileSubtitle ? (
                  <p className="text-purple-600 font-medium mt-2 text-sm">{profileSubtitle}</p>
                ) : (
                  <p className="text-slate-400 mt-2 text-sm">
                    Add your location and experience below
                  </p>
                )}
                {profile.role === "admin" && (
                  <span className="inline-block mt-2 text-xs font-semibold uppercase tracking-wide bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">
                    Admin
                  </span>
                )}
              </div>
            </div>

            {!editing ? (
              <Button
                onClick={() => setEditing(true)}
                className="bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white rounded-xl shadow-md shrink-0"
              >
                <Edit2 size={16} className="mr-2" />
                Edit Profile
              </Button>
            ) : (
              <Button
                onClick={handleCancelEdit}
                variant="outline"
                className="border-purple-200 text-slate-700 hover:bg-purple-50 rounded-xl shrink-0"
              >
                <X size={16} className="mr-2" />
                Cancel editing
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-6">
          {/* Contact & location */}
          <section className="bg-white/90 backdrop-blur-lg rounded-3xl p-6 border border-purple-200 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Contact & location</h2>
            <p className="text-sm text-slate-500 mb-5">
              How recruiters and interview tools can reach you
            </p>

            {!editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={Mail} label="Email" value={profile.email} empty="No email" />
                <InfoRow
                  icon={Phone}
                  label="Phone"
                  value={profile.phone_number}
                  empty="Add a phone number"
                />
                <InfoRow
                  icon={MapPin}
                  label="Location"
                  value={profile.location}
                  empty="Add your city or country"
                />
                <InfoRow
                  icon={Calendar}
                  label="Years of experience"
                  value={profile.years_of_experience}
                  empty="Add experience"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="email" className="text-slate-700">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      value={profile.email || ""}
                      disabled
                      className={`pl-10 ${fieldClass}`}
                    />
                  </div>
                  <p className="text-xs text-slate-400">Email is managed through your account settings</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-slate-700">
                    Phone number
                  </Label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="phone"
                      type="tel"
                      value={profile.phone_number || ""}
                      onChange={(e) =>
                        setProfile({ ...profile, phone_number: e.target.value })
                      }
                      placeholder="+1 555 000 0000"
                      className={`pl-10 ${fieldClass}`}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location" className="text-slate-700">
                    Location
                  </Label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="location"
                      type="text"
                      value={profile.location || ""}
                      onChange={(e) =>
                        setProfile({ ...profile, location: e.target.value })
                      }
                      placeholder="Cairo, Egypt"
                      className={`pl-10 ${fieldClass}`}
                    />
                  </div>
                </div>

                <div className="space-y-2 sm:col-span-2 sm:max-w-xs">
                  <Label htmlFor="years" className="text-slate-700">
                    Total years of experience
                  </Label>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="years"
                      type="number"
                      min={0}
                      max={50}
                      value={profile.years_of_experience ?? 0}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          years_of_experience: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="3"
                      className={`pl-10 ${fieldClass}`}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Professional bio */}
          <section className="bg-white/90 backdrop-blur-lg rounded-3xl p-6 border border-purple-200 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-1">
              <Briefcase className="h-5 w-5 text-purple-600" />
              Professional summary
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              A short intro used across CV tools and job matching
            </p>

            {!editing ? (
              <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-4">
                <p
                  className={`text-sm leading-relaxed whitespace-pre-wrap ${
                    profile.professional_bio?.trim()
                      ? "text-slate-700"
                      : "text-slate-400 italic"
                  }`}
                >
                  {profile.professional_bio?.trim() ||
                    "Tell employers about your background, strengths, and career goals."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="bio" className="text-slate-700">
                  About you
                </Label>
                <Textarea
                  id="bio"
                  value={profile.professional_bio || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, professional_bio: e.target.value })
                  }
                  placeholder="e.g. Full-stack developer with 3 years building React and Laravel apps. Passionate about clean code and user-centered design."
                  rows={5}
                  className="bg-purple-50 border-2 border-purple-200 text-slate-800 placeholder:text-slate-400 rounded-xl focus-visible:ring-purple-500 focus-visible:border-purple-500 resize-none"
                />
                <p className="text-xs text-slate-400">
                  {(profile.professional_bio || "").length} characters · aim for 2–4 sentences
                </p>
              </div>
            )}
          </section>

          {/* Skills */}
          <section className="bg-white/90 backdrop-blur-lg rounded-3xl p-6 border border-purple-200 shadow-lg">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold text-slate-800">Skills</h2>
              <Button
                onClick={() => setShowForm(!showForm)}
                variant="outline"
                className="border-purple-200 text-slate-700 hover:bg-purple-50 rounded-xl"
              >
                <Plus size={16} className="mr-2" />
                {showForm ? "Close" : "Add skill"}
              </Button>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              Powers AI interviews and job recommendations
            </p>

            <div className="flex flex-wrap gap-2 mb-6">
              {skills.length > 0 ? (
                skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="bg-purple-100 text-purple-800 px-3 py-1.5 rounded-full flex items-center gap-2 text-sm font-medium border border-purple-200"
                  >
                    <span>
                      {skill.title}
                      <span className="text-purple-600 font-normal">
                        {" "}
                        · {skill.proficiency_level}
                        {skill.years_of_experience
                          ? ` · ${skill.years_of_experience}y`
                          : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill.id!)}
                      className="hover:bg-purple-200 p-0.5 rounded-full transition-colors"
                      aria-label={`Remove ${skill.title}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-slate-400 text-sm italic">No skills added yet</p>
              )}
            </div>

            {showForm && (
              <form
                onSubmit={handleAddSkill}
                className="rounded-xl border border-purple-100 bg-purple-50/30 p-4 space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="skill-title">Skill name</Label>
                    <Input
                      id="skill-title"
                      type="text"
                      value={newSkill.title}
                      onChange={(e) =>
                        setNewSkill({ ...newSkill, title: e.target.value })
                      }
                      placeholder="React, Python, SQL…"
                      className={fieldClass}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="skill-years">Years</Label>
                    <Input
                      id="skill-years"
                      type="number"
                      min={0}
                      value={newSkill.years_of_experience}
                      onChange={(e) =>
                        setNewSkill({
                          ...newSkill,
                          years_of_experience: Number(e.target.value),
                        })
                      }
                      placeholder="2"
                      className={fieldClass}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="skill-level">Level</Label>
                    <select
                      id="skill-level"
                      value={newSkill.proficiency_level}
                      onChange={(e) =>
                        setNewSkill({
                          ...newSkill,
                          proficiency_level: e.target.value,
                        })
                      }
                      className={fieldClass}
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                      <option value="expert">Expert</option>
                    </select>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white rounded-xl"
                >
                  {loading ? "Saving…" : "Save skill"}
                </Button>
              </form>
            )}
          </section>

          {editing && (
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <Button
                onClick={handleCancelEdit}
                variant="outline"
                className="border-purple-200 text-slate-700 hover:bg-purple-50 rounded-xl px-8"
              >
                Discard changes
              </Button>
              <Button
                onClick={handleSaveProfile}
                disabled={loading}
                className="bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white rounded-xl px-8 shadow-md"
              >
                <Save size={16} className="mr-2" />
                {loading ? "Saving…" : "Save profile"}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
