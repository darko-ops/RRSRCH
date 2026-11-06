import { render, screen } from '@testing-library/react';
import { LoopText } from './Loops';

test('**bold** shows bold without its asterisks, links inside it still link', () => {
  const { container } = render(<p><LoopText text={'**Method**\nWe reran #12.\n\n**Result, see #7**\nA 2 ** 3 grid'} /></p>);
  const bold = [...container.querySelectorAll('strong')].map((b) => b.textContent);
  expect(bold).toEqual(['Method', 'Result, see #7']);
  expect(container.textContent).not.toMatch(/\*\*Method|Method\*\*/);
  expect(container.textContent).toContain('A 2 ** 3 grid');                // stray asterisks stay as typed
  expect(screen.getByRole('link', { name: '#12' })).toHaveAttribute('href', '/posts/12');
  expect(screen.getByRole('link', { name: '#7' }).closest('strong')).not.toBeNull();
});

test('bold never spans lines, and plain text comes back as a string', () => {
  const { container } = render(<p><LoopText text={'**not\nbold**'} /></p>);
  expect(container.querySelector('strong')).toBeNull();
  expect(container.textContent).toBe('**not\nbold**');
  expect(LoopText({ text: 'plain words' })).toBe('plain words');
});
