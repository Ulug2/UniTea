/**
 * Phase 3.1B: ReportModal gained a third reportType ("community") on top of
 * the existing "post"/"comment". These tests confirm the additive lookup-map
 * change renders the correct title/description per type and that existing
 * "post"/"comment" behavior is unchanged.
 */
jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      card: '#fff',
      text: '#000',
      secondaryText: '#666',
      background: '#fff',
      border: '#eee',
      primary: '#2FC9C1',
    },
    isDark: false,
  }),
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ReportModal from '../../components/ReportModal';

describe('ReportModal', () => {
  const noop = () => {};

  it('renders "Report Post" for reportType="post"', () => {
    render(
      <ReportModal visible onClose={noop} onSubmit={noop} reportType="post" />,
    );
    expect(screen.getByText('Report Post')).toBeTruthy();
    expect(screen.getByText("What's wrong with this post?")).toBeTruthy();
  });

  it('renders "Report Comment" for reportType="comment"', () => {
    render(
      <ReportModal visible onClose={noop} onSubmit={noop} reportType="comment" />,
    );
    expect(screen.getByText('Report Comment')).toBeTruthy();
    expect(screen.getByText("What's wrong with this comment?")).toBeTruthy();
  });

  it('renders "Report Community" for reportType="community"', () => {
    render(
      <ReportModal visible onClose={noop} onSubmit={noop} reportType="community" />,
    );
    expect(screen.getByText('Report Community')).toBeTruthy();
    expect(screen.getByText("What's wrong with this community?")).toBeTruthy();
  });

  it('calls onSubmit with the trimmed reason for a community report', () => {
    const onSubmit = jest.fn();
    render(
      <ReportModal visible onClose={noop} onSubmit={onSubmit} reportType="community" />,
    );
    fireEvent.changeText(
      screen.getByPlaceholderText('Describe the issue...'),
      '  toxic community  ',
    );
    fireEvent.press(screen.getByText('Submit'));
    expect(onSubmit).toHaveBeenCalledWith('toxic community');
  });

  it('disables submit while isLoading is true, regardless of reportType', () => {
    const onSubmit = jest.fn();
    render(
      <ReportModal
        visible
        onClose={noop}
        onSubmit={onSubmit}
        isLoading
        reportType="community"
      />,
    );
    fireEvent.changeText(
      screen.getByPlaceholderText('Describe the issue...'),
      'spam',
    );
    // Submit text is replaced by a spinner while loading — pressing where
    // "Submit" would be must not fire onSubmit.
    expect(screen.queryByText('Submit')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
