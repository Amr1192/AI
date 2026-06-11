"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles, AlertCircle, Plus } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

interface UserSkill {
  id: number;
  title: string;
  years_of_experience: number;
  proficiency_level: string;
}

interface NewSkill {
  title: string;
  years_of_experience: number;
  proficiency_level: string;
}

export default function InterviewSetupPage() {
  const router = useRouter();
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [showNoSkillsModal, setShowNoSkillsModal] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);

  const [newSkill, setNewSkill] = useState<NewSkill>({
    title: "",
    years_of_experience: 0,
    proficiency_level: "beginner",
  });

  useEffect(() => {
    const userData = localStorage.getItem("cvmaster_user");
    if (userData) {
      const parsed = JSON.parse(userData);
      setUserId(parsed.id);
    } else {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    if (userId) {
      loadSkills();
    }
  }, [userId]);

  const loadSkills = async () => {
    if (!userId) return;

    setLoadingSkills(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/users/${userId}/skills`);
      if (!res.ok) throw new Error("Failed to load skills");
      const data = await res.json();
      setSkills(data.skills || []);

      if (!data.skills || data.skills.length === 0) {
        setShowNoSkillsModal(true);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingSkills(false);
    }
  };

  const handleQuickAddSkill = async () => {
    if (!newSkill.title.trim()) {
      toast.error("Skill title is required");
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_BASE}/api/profile/skills`,
        { skills: [newSkill] },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      await loadSkills();

      setNewSkill({
        title: "",
        years_of_experience: 0,
        proficiency_level: "beginner",
      });

      toast.success("Skill added! Add more or start your interview.");

    } catch (e: any) {
      toast.error("Failed to add skill");
    } finally {
      setLoading(false);
    }
  };

  const startInterview = async () => {
    if (selectedSkills.length === 0) {
      setError("Please select at least one skill");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/interviews/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          skill_ids: selectedSkills,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to start interview");
      }

      const data = await res.json();
      router.push(`/shadow-interview/${data.id}`);

    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSkill = (skillId: number) => {
    setSelectedSkills(prev =>
      prev.includes(skillId)
        ? prev.filter(id => id !== skillId)
        : [...prev, skillId]
    );
  };

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-[pulse_6s_ease-in-out_infinite]" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-purple-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-[pulse_6s_ease-in-out_infinite_2s]" />
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-purple-50 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-[pulse_6s_ease-in-out_infinite_4s]" />
      </div>

      <div className="max-w-4xl mx-auto p-8 relative z-10">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2 text-slate-800">Start Your AI Interview</h2>
          <p className="text-slate-600">
            Select your skills and let AI generate the interview dynamically.
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <Card className="mb-6 p-4 bg-red-50 border-red-200">
            <p className="text-red-600 text-sm">{error}</p>
          </Card>
        )}

        {/* Skills List */}
        <Card className="p-6 mb-6 bg-white/90 backdrop-blur-lg border border-purple-200 rounded-3xl shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-slate-800">Your Skills</h3>

            <div className="flex gap-2">
              <Button
                onClick={loadSkills}
                disabled={loadingSkills}
                variant="outline"
                className="border-purple-200 text-slate-700 hover:bg-purple-50"
              >
                {loadingSkills ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
                  </>
                ) : (
                  "Reload Skills"
                )}
              </Button>

              <Button
                onClick={() => setShowQuickAddModal(true)}
                variant="outline"
                className="border-purple-200 text-slate-700 hover:bg-purple-50"
              >
                <Plus className="mr-2 h-4 w-4" /> Quick Add
              </Button>
            </div>
          </div>

          {skills.length > 0 ? (
            <div className="space-y-3">
              {skills.map(skill => (
                <div
                  key={skill.id}
                  className="flex items-start gap-4 p-4 rounded-xl border-2 border-purple-100 bg-purple-50/50 hover:bg-purple-50 transition"
                >
                  <div className="pt-0.5 shrink-0">
                    <Checkbox
                      id={`skill-${skill.id}`}
                      checked={selectedSkills.includes(skill.id)}
                      onCheckedChange={() => toggleSkill(skill.id)}
                      className="size-5 border-purple-300 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                    />
                  </div>

                  <Label htmlFor={`skill-${skill.id}`} className="flex-1 cursor-pointer min-w-0">
                    <p className="font-medium text-slate-800">{skill.title}</p>
                    <p className="text-sm text-slate-500">
                      {skill.proficiency_level} • {skill.years_of_experience} years
                    </p>
                  </Label>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No skills found</p>
              <Button
                onClick={() => setShowNoSkillsModal(true)}
                className="mt-4 border-purple-200 text-slate-700 hover:bg-purple-50"
                variant="outline"
              >
                Add Skills Now
              </Button>
            </div>
          )}
        </Card>

        {/* Dynamic Interview Summary */}
        {selectedSkills.length > 0 && (
          <Card className="p-6 mb-6 bg-purple-50 border-2 border-purple-200 rounded-3xl shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              <h3 className="font-semibold text-slate-800">Ready to Start</h3>
            </div>

            <p className="text-sm text-slate-600">
              AI will generate adaptive, skill-based interview questions for:{" "}
              {skills
                .filter(s => selectedSkills.includes(s.id))
                .map(s => s.title)
                .join(", ")}
            </p>
          </Card>
        )}

        {/* Start Button */}
        <Button
          onClick={startInterview}
          disabled={loading || selectedSkills.length === 0}
          size="lg"
          className="w-full bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white rounded-2xl py-6 text-lg font-semibold shadow-lg hover:shadow-xl border-0"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Preparing Interview...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Start AI Interview
            </>
          )}
        </Button>
      </div>

      {/* No Skills Modal */}
      <Dialog open={showNoSkillsModal} onOpenChange={setShowNoSkillsModal}>
        <DialogContent className="bg-white border border-purple-100 rounded-3xl shadow-2xl">
          <DialogHeader>
            <DialogTitle>No Skills Found</DialogTitle>
            <DialogDescription>
              You need at least 3 skills to generate personalized interviews.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <Button
              onClick={() => {
                setShowNoSkillsModal(false);
                setShowQuickAddModal(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Quick Add Skills Here
            </Button>

            <Button
              variant="outline"
              onClick={() => router.push("/profile?tab=skills")}
            >
              Go to Profile to Add Skills
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Add Modal */}
      <Dialog open={showQuickAddModal} onOpenChange={setShowQuickAddModal}>
        <DialogContent className="bg-white border border-purple-100 rounded-3xl shadow-2xl">
          <DialogHeader>
            <DialogTitle>Add Skill</DialogTitle>
            <DialogDescription>
              Quickly add skills to get started.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label>Skill Name</Label>
              <Input
                placeholder="React, SQL, Communication..."
                value={newSkill.title}
                onChange={e =>
                  setNewSkill({ ...newSkill, title: e.target.value })
                }
                className="mt-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Years</Label>
                <Input
                  type="number"
                  min="0"
                  value={newSkill.years_of_experience}
                  onChange={e =>
                    setNewSkill({
                      ...newSkill,
                      years_of_experience: parseInt(e.target.value) || 0,
                    })
                  }
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Level</Label>
                <Select
                  value={newSkill.proficiency_level}
                  onValueChange={value =>
                    setNewSkill({ ...newSkill, proficiency_level: value })
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleQuickAddSkill}
              disabled={loading || !newSkill.title.trim()}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" /> Add Skill
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


