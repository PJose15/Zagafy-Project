import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SignedInCloudProjects } from '@/components/projects/cloud-projects-section';
const state = vi.hoisted(() => ({ accountId: 'user_1', push: vi.fn(), open: vi.fn() }));
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: { id: state.accountId }, isLoaded: true, isSignedIn: !!state.accountId }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock('@/lib/projects/cloud-projects', () => ({ openCloudProject: state.open }));
vi.mock('@/components/antiquarian', () => ({
  ParchmentCard: ({children}: any) => <section>{children}</section>,
  InkStampButton: ({children, ...props}: any) => <button {...props}>{children}</button>,
}));
const fetchMock = vi.fn();
function response(title = 'Cloud novel', extra = {}) { return new Response(JSON.stringify({ data: { me: state.accountId, stories: [{ storyId: 'remote_1', title, role: 'owner', canSync: true }], nextCursor: null, ...extra } })); }
beforeEach(() => { state.accountId = 'user_1'; state.push.mockReset(); state.open.mockReset().mockResolvedValue({ projectId: 'new', created: true }); fetchMock.mockReset().mockImplementation(async () => response()); vi.stubGlobal('fetch', fetchMock); });
afterEach(cleanup);
describe('Cloud project catalog', () => {
  it('opens with the current account and navigates only after download completes', async () => {
    let resolve!: (value: unknown) => void;
    state.open.mockImplementation(() => new Promise(r => { resolve = r; }));
    render(<SignedInCloudProjects />); await screen.findByText('Cloud novel');
    fireEvent.click(screen.getByText('Open project'));
    expect(state.open).toHaveBeenCalledWith('remote_1', 'user_1'); expect(state.push).not.toHaveBeenCalled();
    await screen.findByText('Downloading…'); resolve({ projectId: 'new' });
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/'));
  });
  it('shows a retryable fetch error without claiming an empty catalog', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    render(<SignedInCloudProjects />); await screen.findByRole('alert'); expect(screen.queryByText('No cloud projects yet.')).toBeNull();
    fireEvent.click(screen.getByText('Retry')); await screen.findByText('Cloud novel');
  });
  it('disables download when the owner plan cannot sync', async () => {
    fetchMock.mockImplementation(async () => response('Free owner', { stories: [{ storyId: 'remote_1', title: 'Free owner', role: 'reader', canSync: false }] }));
    render(<SignedInCloudProjects />); await screen.findByText('Free owner');
    expect((screen.getByText('Open project') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Shared · Reader')).not.toBeNull();
  });
  it('discards a stale catalog response after an account switch', async () => {
    let resolve!: (value: Response) => void;
    const stale = response('Previous account novel');
    fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const view = render(<SignedInCloudProjects />);
    state.accountId = 'user_2'; view.rerender(<SignedInCloudProjects />);
    await screen.findByText('Cloud novel'); resolve(stale);
    await waitFor(() => expect(screen.queryByText('Previous account novel')).toBeNull());
  });
  it('keeps the user in the library and shows an error when import fails', async () => {
    state.open.mockRejectedValue(new Error('Disk full'));
    render(<SignedInCloudProjects />); await screen.findByText('Cloud novel'); fireEvent.click(screen.getByText('Open project'));
    await screen.findByRole('alert'); expect(state.push).not.toHaveBeenCalled(); expect(screen.getByText('Cloud novel')).not.toBeNull();
  });
});
