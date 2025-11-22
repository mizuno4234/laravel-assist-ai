import React, { useMemo, useEffect, useRef } from 'react';

declare var marked: any;

// Add window extension for hljs
declare global {
  interface Window {
    hljs: any;
  }
}

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (typeof marked === 'undefined') return content;
    return marked.parse(content);
  }, [content]);

  // Inject Code Block Headers (Language + Copy Button) & Syntax Highlighting
  useEffect(() => {
    if (!containerRef.current) return;

    const preElements = containerRef.current.querySelectorAll('pre');
    
    preElements.forEach((pre) => {
      // Prevent double-wrapping if effect runs twice or already wrapped
      if (pre.parentElement?.classList.contains('code-block-content')) return;

      // 1. Identify Language from <code> class (e.g., language-php)
      const codeElement = pre.querySelector('code');
      let language = 'Code';
      if (codeElement && codeElement.className) {
        const match = codeElement.className.match(/language-(\w+)/);
        if (match) {
          language = match[1].toUpperCase();
        }
      }

      // 2. Create Container Structure
      // Using #282c34 to match Atom One Dark background
      const container = document.createElement('div');
      container.className = 'code-block-container my-5 rounded-lg overflow-hidden border border-slate-700/50 bg-[#282c34] shadow-md';

      // 3. Create Header Bar
      // Using #21252b for header
      const header = document.createElement('div');
      header.className = 'flex items-center justify-between px-4 py-2 bg-[#21252b] border-b border-slate-700/50 select-none';
      
      // Language Label
      const langSpan = document.createElement('span');
      langSpan.className = 'text-xs font-medium text-slate-400 font-mono tracking-wide';
      langSpan.textContent = language;
      
      // Copy Button
      const button = document.createElement('button');
      button.className = 'flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors focus:outline-none group';
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-hover:stroke-indigo-300"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copy</span>
      `;

      // Copy Logic
      button.addEventListener('click', async () => {
        const textToCopy = codeElement?.innerText || pre.innerText;
        
        try {
          await navigator.clipboard.writeText(textToCopy);
          
          // Success Feedback
          button.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span class="text-emerald-400 font-medium">Copied!</span>
          `;
          
          // Revert after 2s
          setTimeout(() => {
            button.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-hover:stroke-indigo-300"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            `;
          }, 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      });

      header.appendChild(langSpan);
      header.appendChild(button);

      // 4. Create Content Wrapper
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'code-block-content overflow-x-auto';

      // 5. Style the PRE element to fit inside
      // Using default text color #abb2bf for One Dark theme base
      pre.className = '!my-0 !bg-transparent !p-4 text-sm font-mono leading-relaxed text-[#abb2bf]';
      
      // Remove margins or special styling from code element if any
      if (codeElement) {
        codeElement.className = `bg-transparent border-none p-0 font-inherit ${codeElement.className}`;
        // Trigger Syntax Highlighting
        if (window.hljs) {
          window.hljs.highlightElement(codeElement);
        }
      }

      // 6. Assembly: Insert container before pre, then move pre inside
      pre.parentNode?.insertBefore(container, pre);
      contentWrapper.appendChild(pre);
      container.appendChild(header);
      container.appendChild(contentWrapper);
    });
  }, [html]);

  return (
    <div 
      ref={containerRef} 
      dangerouslySetInnerHTML={{ __html: html }} 
      className="
        text-slate-200 text-sm md:text-base leading-relaxed
        [&>p]:mb-4 [&>p:last-child]:mb-0
        [&>h1]:text-2xl [&>h1]:font-bold [&>h1]:mb-4 [&>h1]:text-white
        [&>h2]:text-xl [&>h2]:font-bold [&>h2]:mb-3 [&>h2]:text-white [&>h2]:mt-6
        [&>h3]:text-lg [&>h3]:font-bold [&>h3]:mb-2 [&>h3]:text-white [&>h3]:mt-4
        [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-4 [&>ul>li]:pl-1
        [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-4 [&>ol>li]:pl-1
        [&>li]:mb-1 
        [&>blockquote]:border-l-4 [&>blockquote]:border-indigo-500/50 [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-slate-400 [&>blockquote]:mb-4 [&>blockquote]:bg-slate-800/30 [&>blockquote]:py-1
        [&>code]:bg-slate-700/50 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:font-mono [&>code]:text-[0.9em] [&>code]:text-indigo-200 [&>code]:border [&>code]:border-slate-700/50
        [&>a]:text-indigo-400 [&>a]:underline [&>a]:underline-offset-2 [&>a]:decoration-indigo-400/30 hover:[&>a]:decoration-indigo-400
        [&>table]:w-full [&>table]:border-collapse [&>table]:mb-4 [&>table]:text-sm
        [&>th]:border [&>th]:border-slate-700 [&>th]:p-2 [&>th]:bg-slate-800 [&>th]:text-left
        [&>td]:border [&>td]:border-slate-700 [&>td]:p-2
        [&>hr]:border-slate-700 [&>hr]:my-6
      "
    />
  );
};

export default MarkdownRenderer;