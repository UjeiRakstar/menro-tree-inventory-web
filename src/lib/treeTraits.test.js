import { describe, it, expect } from 'vitest';
import { biodiversityTrait, categoryTrait, normalizeCategory, sourceTrait, traitsOf } from './treeTraits.js';

describe('treeTraits', () => {
  it('reads endemic and invasive from biodiversity_status', () => {
    expect(biodiversityTrait({ biodiversity_status: 'Endemic' }).key).toBe('endemic');
    expect(biodiversityTrait({ biodiversity_status: 'Invasive' }).key).toBe('invasive');
  });

  it('falls back to species_type when biodiversity_status is missing', () => {
    expect(biodiversityTrait({ species_type: 'Invasive' }).key).toBe('invasive');
  });

  it('shows no badge for a status that is neither endemic nor invasive', () => {
    // species_type also carries these two, and neither has an icon.
    expect(biodiversityTrait({ species_type: 'Introduced' })).toBeNull();
    expect(biodiversityTrait({ species_type: 'Unknown' })).toBeNull();
    expect(biodiversityTrait({})).toBeNull();
  });

  it('reduces every spelling of a category to one comparable word', () => {
    // The filter pills and the stored values are compared through this, so
    // "Fruit" must not be a different category from "Fruit Tree".
    expect(normalizeCategory('Fruit')).toBe('fruit');
    expect(normalizeCategory('Fruit Tree')).toBe('fruit');
    expect(normalizeCategory('Fruit Trees')).toBe('fruit');
    expect(normalizeCategory('TIMBER')).toBe('timber');
    expect(normalizeCategory('Ornamental Trees')).toBe('ornamental');
    expect(normalizeCategory(null)).toBe('');
  });

  it('accepts both spellings the mobile app writes for a fruit tree', () => {
    expect(categoryTrait({ tree_category: 'Fruit' }).key).toBe('fruit');
    expect(categoryTrait({ tree_category: 'Fruit Tree' }).key).toBe('fruit');
    expect(categoryTrait({ tree_category: 'Fruit Trees' }).key).toBe('fruit');
  });

  it('reads the other two categories, and nothing for an unknown one', () => {
    expect(categoryTrait({ tree_category: 'Timber' }).key).toBe('timber');
    expect(categoryTrait({ tree_category: 'Ornamental' }).key).toBe('ornamental');
    expect(categoryTrait({ tree_category: 'Unknown' })).toBeNull();
    expect(categoryTrait({})).toBeNull();
  });

  it('treats a record with no source as field-gathered', () => {
    // Every row that predates trees.source came from the field officers' app.
    expect(sourceTrait({}).key).toBe('field');
    expect(sourceTrait({ source: 'field' }).key).toBe('field');
    expect(sourceTrait({ source: 'something-else' }).key).toBe('field');
  });

  it('marks a resident submission as crowdsourced', () => {
    expect(sourceTrait({ source: 'crowdsource' }).key).toBe('crowdsource');
    expect(sourceTrait({ source: 'Crowdsourced' }).key).toBe('crowdsource');
  });

  it('gives every badge an icon, a label and an explanation', () => {
    const traits = traitsOf({ biodiversity_status: 'Endemic', tree_category: 'Timber', source: 'crowdsource' });
    expect(traits.map((t) => t.key)).toEqual(['endemic', 'timber', 'crowdsource']);
    for (const trait of traits) {
      expect(trait.icon).toBeTruthy();
      expect(trait.label.length).toBeGreaterThan(0);
      expect(trait.description.length).toBeGreaterThan(0);
    }
  });

  it('drops only the badges the record cannot say, keeping the order', () => {
    const traits = traitsOf({ species_type: 'Introduced', tree_category: 'Ornamental' });
    expect(traits.map((t) => t.key)).toEqual(['ornamental', 'field']);
  });
});
