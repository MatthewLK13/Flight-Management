import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Flight operations dashboard', () => {
  it('renders the Vietnamese title and the map, queue, and DCL event regions', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /ứng dụng cpdlc- dcl trong quản lý luồng không lưu/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /parking chart/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /hàng chờ cất cánh/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /bản tin dcl/i })).toBeInTheDocument();
    expect(screen.getByAltText(/sơ đồ đường băng, đường lăn và vị trí đỗ/i)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'TSAT' })).toBeInTheDocument();
  });

  it('keeps the page rendered after loading a flight CSV and running the simulation', async () => {
    const csvText = 'AirportDeliveryCode,AirportReceiptCode,CallSign,PlaneTypeCode,FlyDate,DeliveryTime\nVVTS,VVDN,VNA123,A320,03/11/23,05:00';
    const file = new File([csvText], 'flights.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(csvText).buffer });
    const handle = { getFile: vi.fn().mockResolvedValue(file) };
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockResolvedValue([handle]));
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: vi.fn().mockResolvedValue([handle]) });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /tải tệp mới/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /chạy mô phỏng/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /chạy mô phỏng/i }));
    await waitFor(() => expect(screen.getAllByText('VNA123').length).toBeGreaterThan(0));
    expect(screen.getByRole('heading', { name: /ứng dụng cpdlc- dcl trong quản lý luồng không lưu/i })).toBeInTheDocument();
    const dclBoard = screen.getByRole('table', { name: /bảng điện văn dcl/i });
    expect(dclBoard).toHaveTextContent('GIỜ');
    expect(screen.getByRole('columnheader', { name: 'TSAT' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: /tua thời gian mô phỏng/i }), { target: { value: '1440' } });
    await waitFor(() => expect(dclBoard).toHaveTextContent('CLD'));
    expect(dclBoard).toHaveTextContent('TSAT');
    expect(screen.getAllByText('VNA123').length).toBeGreaterThan(0);
  });
});
