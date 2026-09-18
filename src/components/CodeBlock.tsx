// =============================================================================
// Memory Board – TipTap Code Block Node View
//
// Wraps @tiptap/extension-code-block-lowlight with a React NodeView so we can
// inject a "Copy" button that becomes visible on hover.
//
// Usage: pass this component to ReactNodeViewRenderer() and attach it to the
//        CodeBlockLowlight extension via .extend({ addNodeView() { … } }).
// =============================================================================

import React, { useState } from 'react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/core';

export const CodeBlockView: React.FC<NodeViewProps> = ({ node }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // node.textContent gives the raw text inside the code block
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      // Reset the button label after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS context) – fail silently
    }
  };

  return (
    // NodeViewWrapper renders a <div> that TipTap manages as a node boundary
    <NodeViewWrapper className="relative my-4 group not-prose">
      {/* Syntax-highlighted code block */}
      <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 pt-8 overflow-x-auto text-sm leading-relaxed m-0">
        {/* NodeViewContent renders the editable <code> element inside the pre */}
        <NodeViewContent as="code" />
      </pre>

      {/* Copy button – hidden until the card is hovered via group-hover */}
      <button
        onClick={handleCopy}
        // contentEditable=false prevents TipTap from treating the button as
        // editable content inside the code block node
        contentEditable={false}
        className={`
          absolute top-2 right-2
          px-2.5 py-1 rounded-md text-xs font-mono font-medium
          transition-all duration-150 select-none
          ${copied
            ? 'bg-emerald-600 text-white opacity-100'
            : 'bg-gray-700 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-600 hover:text-white'
          }
        `}
      >
        {copied ? '✓ Copied!' : 'Copy'}
      </button>
    </NodeViewWrapper>
  );
};
