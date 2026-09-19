import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
export type ButtonSize = 'md' | 'lg' | 'xl';

const base =
  'inline-flex items-center justify-center gap-2 font-semibold rounded-full select-none transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)]';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--sage)] text-[var(--paper-raised)] hover:bg-[var(--sage-deep)] shadow-[var(--shadow-soft)]',
  secondary: 'bg-[var(--paper-raised)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--line-strong)]',
  ghost: 'bg-transparent text-[var(--ink)] hover:bg-[var(--paper-sunk)]',
  danger: 'bg-[var(--sos)] text-white hover:brightness-110 shadow-[var(--shadow-lift)]',
  quiet: 'bg-[var(--paper-sunk)] text-[var(--ink)] hover:bg-[var(--line)]',
};

// Every size meets the 44px minimum touch target; xl is for primary life-safety actions.
const sizes: Record<ButtonSize, string> = {
  md: 'min-h-11 px-5 text-[0.95rem]',
  lg: 'min-h-13 px-6 text-base',
  xl: 'min-h-16 px-8 text-lg',
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & CommonProps>(
  ({ variant = 'primary', size = 'md', icon, block, className, children, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(base, variants[variant], sizes[size], block && 'w-full', className)} {...props}>
      {icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export const LinkButton = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & CommonProps>(
  ({ variant = 'primary', size = 'md', icon, block, className, children, ...props }, ref) => (
    <a ref={ref} className={cn(base, variants[variant], sizes[size], block && 'w-full', className)} {...props}>
      {icon}
      {children}
    </a>
  ),
);
LinkButton.displayName = 'LinkButton';

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: ButtonVariant; size?: 'md' | 'lg' }
>(({ label, variant = 'ghost', size = 'md', className, children, type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-label={label}
    title={label}
    className={cn(base, variants[variant], size === 'lg' ? 'size-14' : 'size-11', 'p-0', className)}
    {...props}
  >
    {children}
  </button>
));
IconButton.displayName = 'IconButton';
