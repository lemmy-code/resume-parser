import { z } from 'zod';

export const experienceSchema = z.object({
  company: z.string(),
  role: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  current: z.boolean(),
  description: z.string(),
});

export const educationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  graduationYear: z.number().nullable(),
});

export const parsedResumeSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  summary: z.string().nullable(),
  totalYearsExperience: z.number(),
  skills: z.array(z.string()),
  languages: z.array(z.string()),
  experience: z.array(experienceSchema),
  education: z.array(educationSchema),
  certifications: z.array(z.string()),
});

export type ParsedResumeSchemaType = z.infer<typeof parsedResumeSchema>;
