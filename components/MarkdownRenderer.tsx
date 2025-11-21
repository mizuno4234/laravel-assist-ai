import React, { useMemo, useEffect, useRef } from 'react';

declare var marked: any;

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (typeof marked === 'undefined') return content;
    return marked.parse(content);
  }, [content]);

  // Inject Copy Buttons into <pre> blocks
  useEffect(() => {
    if (!containerRef.current) return;

    const preElements = containerRef.current.querySelectorAll('pre');
    
    preElements.forEach((pre) => {
      // Prevent double-wrapping if effect runs twice
      if (pre.parentElement?.classList.contains('code-block-wrapper')) return;

      // Create wrapper for positioning
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper relative group my-4';
      
      // Insert wrapper before pre
      pre.parentNode?.insertBefore(wrapper, pre);
      // Move pre into wrapper
      wrapper.appendChild(pre);
      
      // Style the pre element
      pre.className = 'bg-[#1e1e1e] text-gray-200 p-4 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed';
      
      // Find code element to copy
      const codeElement = pre.querySelector('code');
      // Style code element if exists to ensure background matches
      if (codeElement) {
        codeElement.className = 'bg-transparent p-0 border-none';
      }

      // Create copy button
      const button = document.createElement('button');
      button.className = 'absolute top-2 right-2 p-1.5 text-gray-400 hover:text-white bg-gray-700/50 hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-1 z-10';
      // Visible on touch devices (no hover needed)
      button.classList.add('opacity-100', 'md:opacity-0'); 
      
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      `;
      button.setAttribute('aria-label', 'Copy code');

      // Add click handler
      button.addEventListener('click', async () => {
        const textToCopy = codeElement?.innerText || pre.innerText;
        
        try {
          await navigator.clipboard.writeText(textToCopy);
          
          // Show feedback
          const originalHtml = button.innerHTML;
          button.innerHTML = `<span class="text-xs font-medium text-emerald-400">Copied!</span>`;
          button.classList.remove('md:opacity-0'); // Keep visible while showing feedback
          button.classList.add('opacity-100');
          
          setTimeout(() => {
            button.innerHTML = originalHtml;
            button.classList.add('md:opacity-0'); // Revert to hover-only on desktop
            button.classList.remove('opacity-100');
          }, 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      });

      wrapper.appendChild(button);
    });
  }, [html]);

  return (
    <div 
      ref={containerRef} 
      dangerouslySetInnerHTML={{ __html: html }} 
      className="
        text-slate-200 
        [&>p]:mb-4 [&>p:last-child]:mb-0
        [&>h1]:text-2xl [&>h1]:font-bold [&>h1]:mb-4 [&>h1]:text-white
        [&>h2]:text-xl [&>h2]:font-bold [&>h2]:mb-3 [&>h2]:text-white [&>h2]:mt-6
        [&>h3]:text-lg [&>h3]:font-bold [&>h3]:mb-2 [&>h3]:text-white [&>h3]:mt-4
        [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-4 
        [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-4 
        [&>li]:mb-1 
        [&>blockquote]:border-l-4 [&>blockquote]:border-slate-600 [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-slate-400 [&>blockquote]:mb-4
        [&>code]:bg-slate-800 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:font-mono [&>code]:text-sm [&>code]:text-indigo-200
        [&>pre]:mb-4
        [&>a]:text-indigo-400 [&>a]:underline [&>a]:underline-offset-2
        [&>table]:w-full [&>table]:border-collapse [&>table]:mb-4
        [&>th]:border [&>th]:border-slate-700 [&>th]:p-2 [&>th]:bg-slate-800
        [&>td]:border [&>td]:border-slate-700 [&>td]:p-2
      "
    />
  );
};

export default MarkdownRenderer;