'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { ParchmentCard } from './parchment-card';
import { BrassButton } from './brass-button';

interface FeatureErrorBoundaryProps {
  title: string;
  children: React.ReactNode;
}

interface BoundaryClassProps extends FeatureErrorBoundaryProps {
  /** Translated body copy — provided by the FeatureErrorBoundary wrapper. */
  bodyText: string;
  /** Translated retry-button label — provided by the wrapper. */
  retryLabel: string;
}

interface FeatureErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class FeatureErrorBoundaryClass extends React.Component<
  BoundaryClassProps,
  FeatureErrorBoundaryState
> {
  constructor(props: BoundaryClassProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): FeatureErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[${this.props.title}] Error caught:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ParchmentCard padding="lg" className="border border-wax-500/30">
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-wax-500/10 flex items-center justify-center">
              <AlertTriangle size={24} className="text-wax-500" />
            </div>
            <div>
              <h3 className="text-lg font-serif font-semibold text-sepia-900">
                {this.props.title}
              </h3>
              <p className="text-sm text-sepia-600 mt-1">
                {this.props.bodyText}
              </p>
              {this.state.error && (
                <p className="text-xs font-mono text-sepia-600 mt-2 max-w-md truncate">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <BrassButton onClick={this.handleRetry} size="sm">
              {this.props.retryLabel}
            </BrassButton>
          </div>
        </ParchmentCard>
      );
    }

    return this.props.children;
  }
}

/**
 * i18n wrapper: class boundaries can't use hooks, so this function component
 * resolves the translated copy and hands it to the class as plain props. The
 * public API (title + children) is unchanged for all existing usages.
 */
export function FeatureErrorBoundary({ title, children }: FeatureErrorBoundaryProps) {
  const t = useTranslations('featureError');
  return (
    <FeatureErrorBoundaryClass title={title} bodyText={t('body')} retryLabel={t('retry')}>
      {children}
    </FeatureErrorBoundaryClass>
  );
}
