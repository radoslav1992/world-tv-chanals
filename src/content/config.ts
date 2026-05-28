import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string(),
    updated: z.string().optional(),
    author: z.string().default('World TV Channels'),
    tags: z.array(z.string()).default([]),
  }),
});

const channels = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    description: z.string(),
    launched: z.string().optional(),
    owner: z.string().optional(),
    headquarters: z.string().optional(),
    category: z.string(),
    availability: z.array(z.string()).default([]),
    website: z.string().optional(),
    language: z.string().default('English'),
    country: z.string().default('International'),
    slogan: z.string().optional(),
  }),
});

export const collections = { blog, channels };
