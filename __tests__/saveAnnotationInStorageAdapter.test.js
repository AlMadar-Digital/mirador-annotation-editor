import { saveAnnotationInStorageAdapter } from '../src/annotationForm/AnnotationFormUtils';

/** A stand-in storage adapter holding `items`, recording what it's asked to save */
const fakeAdapter = (items = []) => ({
  all: vi.fn(async () => ({ items })),
  annotationPageId: 'page',
  create: vi.fn(async () => ({ items })),
  getStorageAdapterUser: () => 'editor',
  update: vi.fn(async () => ({ items })),
});

const existing = [
  { 'dbf:kind': 'Journey', 'dbf:order': 0, id: 'journey' },
  { 'dbf:kind': 'POI', 'dbf:order': 1, id: 'poi' },
];

describe('saveAnnotationInStorageAdapter dbf:order (issue #434)', () => {
  it('puts a new poi at the end of the top-level list', async () => {
    const adapter = fakeAdapter(existing);

    await saveAnnotationInStorageAdapter('canvas', adapter, vi.fn(), { 'dbf:kind': 'POI', maeData: {} });

    expect(adapter.create).toHaveBeenCalledWith(expect.objectContaining({ 'dbf:order': 2 }));
  });

  it('puts a new journey at the end of the top-level list', async () => {
    const adapter = fakeAdapter(existing);

    await saveAnnotationInStorageAdapter('canvas', adapter, vi.fn(), { 'dbf:kind': 'Journey', maeData: {} });

    expect(adapter.create).toHaveBeenCalledWith(expect.objectContaining({ 'dbf:order': 2 }));
  });

  it("leaves a new journey stop's order to its journey", async () => {
    const adapter = fakeAdapter(existing);
    const stop = { 'dbf:journey': { id: 'journey', order: 0 }, 'dbf:kind': 'POI', maeData: {} };

    await saveAnnotationInStorageAdapter('canvas', adapter, vi.fn(), stop);

    expect(adapter.create.mock.calls[0][0]['dbf:order']).toBeUndefined();
  });

  it("doesn't touch an existing annotation's order on update", async () => {
    const adapter = fakeAdapter(existing);

    await saveAnnotationInStorageAdapter('canvas', adapter, vi.fn(), { 'dbf:kind': 'POI', id: 'poi', maeData: {} });

    expect(adapter.all).not.toHaveBeenCalled();
    expect(adapter.update.mock.calls[0][0]['dbf:order']).toBeUndefined();
  });
});
