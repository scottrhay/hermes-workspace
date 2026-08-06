import { describe, it, expect } from 'vitest';
import {
  isMarketing,
  isTraining,
  classifyWorkstream,
  filterByCategory,
} from './mission-categories';

describe('isMarketing', () => {
  it('returns true for title containing a marketing keyword', () => {
    expect(isMarketing({ title: 'Social Media Campaign', groupName: 'General' })).toBe(true);
    expect(isMarketing({ title: 'Email Marketing Blast', groupName: 'General' })).toBe(true);
    expect(isMarketing({ title: 'New Product Launch', groupName: 'General' })).toBe(true);
    expect(isMarketing({ title: 'Newsletter Design Review', groupName: 'General' })).toBe(true);
    expect(isMarketing({ title: 'Branding Guidelines Update', groupName: 'General' })).toBe(true);
  });

  it('returns true for groupName containing a marketing keyword', () => {
    expect(isMarketing({ title: 'Weekly sync', groupName: 'Marketing Team' })).toBe(true);
    expect(isMarketing({ title: 'Q3 goals', groupName: 'Campaign Operations' })).toBe(true);
  });

  it('returns false for unrelated titles', () => {
    expect(isMarketing({ title: 'Daily standup', groupName: 'Engineering' })).toBe(false);
    expect(isMarketing({ title: 'Training course review', groupName: 'HR' })).toBe(false);
    expect(isMarketing({ title: 'Budget planning', groupName: 'Finance' })).toBe(false);
  });
});

describe('isTraining', () => {
  it('returns true for title containing a training keyword', () => {
    expect(isTraining({ title: 'Python Training Course', groupName: 'General' })).toBe(true);
    expect(isTraining({ title: 'Sales Coaching Workshop', groupName: 'General' })).toBe(true);
    expect(isTraining({ title: 'Onboarding Tutorial', groupName: 'General' })).toBe(true);
    expect(isTraining({ title: 'Certification Prep Session', groupName: 'General' })).toBe(true);
    expect(isTraining({ title: 'eLearning Module Review', groupName: 'General' })).toBe(true);
  });

  it('returns true for groupName containing a training keyword', () => {
    expect(isTraining({ title: 'Weekly sync', groupName: 'Training Department' })).toBe(true);
    expect(isTraining({ title: 'Q2 planning', groupName: 'Bootcamp Cohort' })).toBe(true);
  });

  it('returns false for unrelated titles', () => {
    expect(isTraining({ title: 'Marketing Newsletter', groupName: 'Growth' })).toBe(false);
    expect(isTraining({ title: 'Weekly review', groupName: 'Product' })).toBe(false);
    expect(isTraining({ title: 'Sprint retrospective', groupName: 'Engineering' })).toBe(false);
  });
});

describe('cross-category matching', () => {
  it('matches BOTH categories when title contains both keyword sets', () => {
    const ws = { title: 'Marketing Training Course', groupName: 'General' };
    expect(isMarketing(ws)).toBe(true);
    expect(isTraining(ws)).toBe(true);
    const result = classifyWorkstream(ws);
    expect(result.isMarketing).toBe(true);
    expect(result.isTraining).toBe(true);
  });

  it('matches neither category for a fully unrelated workstream', () => {
    const ws = { title: 'Daily Standup', groupName: 'Project Update' };
    expect(isMarketing(ws)).toBe(false);
    expect(isTraining(ws)).toBe(false);
    const result = classifyWorkstream(ws);
    expect(result.isMarketing).toBe(false);
    expect(result.isTraining).toBe(false);
  });
});

describe('case-insensitivity', () => {
  it('matches marketing keywords regardless of case in title', () => {
    expect(isMarketing({ title: 'SOCIAL MEDIA CAMPAIGN', groupName: 'General' })).toBe(true);
    expect(isMarketing({ title: 'Email MARKETING blast', groupName: 'General' })).toBe(true);
  });

  it('matches training keywords regardless of case in title', () => {
    expect(isTraining({ title: 'PYTHON TRAINING COURSE', groupName: 'General' })).toBe(true);
    expect(isTraining({ title: 'Sales COACHING Workshop', groupName: 'General' })).toBe(true);
  });

  it('matches keywords regardless of case in groupName', () => {
    expect(isMarketing({ title: 'Weekly sync', groupName: 'MARKETING TEAM' })).toBe(true);
    expect(isTraining({ title: 'Weekly sync', groupName: 'TRAINING DEPARTMENT' })).toBe(true);
  });
});

describe('filterByCategory', () => {
  const workstreams = [
    { title: 'Social Media Campaign', groupName: 'General' },
    { title: 'Python Training Course', groupName: 'General' },
    { title: 'Marketing Training Course', groupName: 'General' },
    { title: 'Daily Standup', groupName: 'Project Update' },
    { title: 'Email Marketing Blast', groupName: 'General' },
    { title: 'Sales Coaching Workshop', groupName: 'General' },
  ];

  it('returns only marketing items for filterByCategory("marketing")', () => {
    const result = filterByCategory(workstreams, 'marketing');
    expect(result).toContainEqual({ title: 'Social Media Campaign', groupName: 'General' });
    expect(result).toContainEqual({ title: 'Marketing Training Course', groupName: 'General' });
    expect(result).toContainEqual({ title: 'Email Marketing Blast', groupName: 'General' });
    // training-only should be excluded
    expect(result).not.toContainEqual({ title: 'Python Training Course', groupName: 'General' });
    expect(result).not.toContainEqual({ title: 'Sales Coaching Workshop', groupName: 'General' });
    // unrelated should be excluded
    expect(result).not.toContainEqual({ title: 'Daily Standup', groupName: 'Project Update' });
  });

  it('does not include training-only items in marketing filter', () => {
    const result = filterByCategory(workstreams, 'marketing');
    const titles = result.map((w) => w.title);
    expect(titles).not.toContain('Python Training Course');
    expect(titles).not.toContain('Sales Coaching Workshop');
  });

  it('returns only training items for filterByCategory("training")', () => {
    const result = filterByCategory(workstreams, 'training');
    expect(result).toContainEqual({ title: 'Python Training Course', groupName: 'General' });
    expect(result).toContainEqual({ title: 'Marketing Training Course', groupName: 'General' });
    expect(result).toContainEqual({ title: 'Sales Coaching Workshop', groupName: 'General' });
    // marketing-only should be excluded
    expect(result).not.toContainEqual({ title: 'Social Media Campaign', groupName: 'General' });
    expect(result).not.toContainEqual({ title: 'Email Marketing Blast', groupName: 'General' });
    // unrelated should be excluded
    expect(result).not.toContainEqual({ title: 'Daily Standup', groupName: 'Project Update' });
  });

  it('does not include marketing-only items in training filter', () => {
    const result = filterByCategory(workstreams, 'training');
    const titles = result.map((w) => w.title);
    expect(titles).not.toContain('Social Media Campaign');
    expect(titles).not.toContain('Email Marketing Blast');
  });

  it('returns an empty array when no items match the category', () => {
    const unrelated = [
      { title: 'Daily Standup', groupName: 'Engineering' },
      { title: 'Sprint retrospective', groupName: 'Product' },
    ];
    expect(filterByCategory(unrelated, 'marketing')).toHaveLength(0);
    expect(filterByCategory(unrelated, 'training')).toHaveLength(0);
  });

  it('preserves item shape (generic type parameter)', () => {
    const extended = [
      { title: 'Social Media Campaign', groupName: 'General', id: 1 },
      { title: 'Daily Standup', groupName: 'Engineering', id: 2 },
    ];
    const result = filterByCategory(extended, 'marketing');
    expect(result[0].id).toBe(1);
  });
});

