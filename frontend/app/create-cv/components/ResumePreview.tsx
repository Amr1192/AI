"use client";
import React from "react";

export interface ExperienceItem {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  description: string;
}
export interface EducationItem {
  id: string;
  university: string;
  faculty: string;
  field: string;
  startDate: string;
  endDate: string;
  currentlyStudying?: boolean;
}
export interface CVDataPreview {
  personalInfo: {
    fullName: string;
    jobTitle?: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    github?: string;
    militaryService?: string;
  };
  summary: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: string[];
  themeColor?: string;
  projects?: {
    id: string;
    title: string;
    description: string;
    link?: string;
    isGithubRepo?: boolean;
  }[];
  fontSize?: number;
  fontSizes?: { name?: number; title?: number; body?: number };
  linkifyContacts?: boolean;
  achievements?: string[];
}

export default function ResumePreview({ cv }: { cv: CVDataPreview }) {
  const name = (cv.personalInfo.fullName || "Your Name").trim();
  const parts = name.split(/\s+/);
  const firstLine = parts.slice(0, 2).join(" ");
  const nextLine = parts.slice(2).join(" ");
  const fontSize = cv.fontSizes?.body || cv.fontSize || 10.5;
  const nameSize = cv.fontSizes?.name || 26;
  const titleSize = cv.fontSizes?.title || 14;
  const formatRange = (start?: string, end?: string) => {
    const parts = [start, end].filter(Boolean);
    return parts.length ? parts.join(" - ") : "";
  };
  return (
    <div
      id="resume-root"
      className="shadow-lg h-full p-8 sm:p-6 md:p-8 lg:p-10 w-full max-w-[900px] mx-auto bg-white rounded-lg overflow-hidden"
      style={{
        borderTopWidth: 15,
        borderTopColor: cv.themeColor || "#000000",
        borderTopStyle: "solid",
        fontSize: `${fontSize}pt`,
      }}
    >
      <div className="mb-2">
        <div className="flex justify-between items-start border-b border-gray-200 pb-3">
          <div>
            <h1
              className="font-bold text-gray-900 leading-tight"
              style={{ fontSize: `${nameSize}pt` }}
            >
              <div>{firstLine}</div>
              {nextLine && <div>{nextLine}</div>}
            </h1>
            {cv.personalInfo.jobTitle && (
              <p
                className="text-gray-800 font-medium mt-1"
                style={{ fontSize: `${titleSize}pt` }}
              >
                {cv.personalInfo.jobTitle}
              </p>
            )}
          </div>
          <div className="text-right text-sm text-gray-600 space-y-0.5">
            {cv.personalInfo.email && (
              <p>
                {cv.linkifyContacts ? (
                  <a
                    href={`mailto:${cv.personalInfo.email}`}
                    className="underline"
                  >
                    {cv.personalInfo.email}
                  </a>
                ) : (
                  cv.personalInfo.email
                )}
              </p>
            )}
            {cv.personalInfo.phone && (
              <p>
                {cv.linkifyContacts ? (
                  <a
                    href={`tel:${cv.personalInfo.phone}`}
                    className="underline"
                  >
                    {cv.personalInfo.phone}
                  </a>
                ) : (
                  cv.personalInfo.phone
                )}
              </p>
            )}
            {cv.personalInfo.location && <p>{cv.personalInfo.location}</p>}
            {cv.personalInfo.linkedin && (
              <p>
                {cv.linkifyContacts ? (
                  <a
                    href={cv.personalInfo.linkedin}
                    target="_blank"
                    className="underline"
                  >
                    LinkedIn
                  </a>
                ) : (
                  cv.personalInfo.linkedin
                )}
              </p>
            )}
            {cv.personalInfo.github && (
              <p>
                {cv.linkifyContacts ? (
                  <a
                    href={cv.personalInfo.github}
                    target="_blank"
                    className="underline"
                  >
                    GitHub
                  </a>
                ) : (
                  cv.personalInfo.github
                )}
              </p>
            )}
            {cv.personalInfo.militaryService && (
              <p>{cv.personalInfo.militaryService}</p>
            )}
          </div>
        </div>
      </div>

      {cv.summary && (
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Professional Summary
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed">{cv.summary}</p>
        </div>
      )}

      {cv.education.length > 0 && (
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Education
          </h2>
          <div className="space-y-2">
            {cv.education.map((edu, index) => (
              <div key={edu.id ?? `education-${index}`}>
                <div className="flex justify-between items-start">
                  <h3 className="font-medium text-gray-900">
                    {edu.university || edu.field || "University"}
                  </h3>
                  {(edu.startDate || edu.endDate) && (
                    <p className="text-xs text-gray-600 whitespace-nowrap">
                      {formatRange(edu.startDate, edu.endDate)}
                    </p>
                  )}
                </div>
                {(edu.faculty || edu.field) && (
                  <p className="text-sm text-gray-700">
                    {[edu.faculty, edu.field].filter(Boolean).join(" • ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {cv.experience.length > 0 && (
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Work Experience
          </h2>
          <div className="space-y-3">
            {cv.experience.map((exp, index) => (
              <div key={exp.id ?? `experience-${index}`}>
                <div className="flex justify-between items-start">
                  <h3 className="font-medium text-gray-900">
                    {exp.position || exp.company || "Position"}
                  </h3>
                  {(exp.startDate || exp.endDate) && (
                    <p className="text-xs text-gray-600 whitespace-nowrap">
                      {formatRange(exp.startDate, exp.endDate)}
                    </p>
                  )}
                </div>
                <p className="text-sm text-gray-700">
                  {exp.company || "Company"}
                </p>
                {exp.description && (
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {exp.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {cv.projects && cv.projects.length > 0 && (
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Projects</h2>
          <div className="space-y-2">
            {cv.projects.map((p, index) => (
              <div key={p.id ?? `project-${index}`}>
                <div className="flex justify-between items-start">
                  <h3 className="font-medium text-gray-900">{p.title}</h3>
                  {p.link && (
                    <a
                      href={p.link}
                      target="_blank"
                      className="text-xs text-blue-600 underline"
                    >
                      {p.isGithubRepo ? "Github Repo" : p.link}
                    </a>
                  )}
                </div>
                {p.description && (
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {p.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {cv.achievements && cv.achievements.length > 0 && (
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Achievements
          </h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
            {cv.achievements.map((a, idx) => (
              <li key={idx}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {cv.skills.length > 0 && (
        <div className="mb-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {cv.skills.map((skill, idx) => (
              <span
                key={idx}
                className="text-xs bg-gray-100 text-gray-800 px-3 py-1 rounded-full"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}