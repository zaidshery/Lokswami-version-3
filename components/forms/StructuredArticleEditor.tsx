'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CharacterCount } from '@tiptap/extension-character-count';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { Fragment, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import {
  ArrowDown,
  ArrowUp,
  Bold,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MessageSquareQuote,
  Redo2,
  Table2,
  Underline,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/auth/clientToken';
import { useArticleLock } from '@/lib/hooks/useArticleLock';
import { canTakeOverArticleLock } from '@/lib/auth/permissions';
import type { AdminRole } from '@/lib/auth/roles';
import { ArticleImage, ArticleResourceCard } from '@/lib/editor/articleTiptapExtensions';
import {
  buildPolishedPlainTextHtml,
  polishArticleEditorHtml,
} from '@/lib/utils/articlePasteFormatting';
import { normalizeArticleEditorLinkUrl } from '@/lib/utils/articleEditorTemplates';
import { extractYouTubeVideoId } from '@/lib/utils/youtube';

type StructuredArticleEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onDocumentChange?: (value: Record<string, unknown>) => void;
  placeholder?: string;
  editorClassName?: string;
  articleId?: string;
  currentUserRole?: string;
  onLockChange?: (hasLock: boolean) => void;
};

type EditorTool = 'link' | 'youtube' | 'social' | 'resource' | 'table' | 'quote' | 'image';

const HINDI_EDITOR_FONT_STYLE =
  '"Noto Sans Devanagari", "Noto Sans", Mangal, "Kohinoor Devanagari", system-ui, sans-serif';

function hasDevanagariText(value: string) {
  return /[\u0900-\u097F]/u.test(value);
}

function cleanEditorHtml(value: string) {
  return value === '<p></p>' ? '' : value;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function StructuredArticleEditor({
  value,
  onChange,
  onDocumentChange,
  placeholder = 'Write your article content here…',
  editorClassName = 'min-h-64',
  articleId,
  currentUserRole,
  onLockChange,
}: StructuredArticleEditorProps) {
  const { hasLock, lockedBy, isTakingOver, takeOver } = useArticleLock({
    articleId,
    enabled: Boolean(articleId),
    onLockStatusChange: onLockChange,
  });

  const isLockedByOther = Boolean(articleId && !hasLock && lockedBy);
  const canTakeOver = Boolean(
    isLockedByOther &&
      currentUserRole &&
      canTakeOverArticleLock(currentUserRole as AdminRole)
  );

  const [showTakeOverModal, setShowTakeOverModal] = useState(false);
  const [takeOverToast, setTakeOverToast] = useState('');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const toolDialogRef = useRef<HTMLDivElement>(null);
  const toolOpenerRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const uploadDropRef = useRef<(file: File, position?: number) => void>(() => undefined);
  const [activeTool, setActiveTool] = useState<EditorTool | null>(null);
  const [toolFields, setToolFields] = useState<Record<string, string>>({});
  const [toolError, setToolError] = useState('');
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [isUploadingInlineImage, setIsUploadingInlineImage] = useState(false);
  const [pendingImagePosition, setPendingImagePosition] = useState<number | undefined>();
  const [, setEditorRevision] = useState(0);
  const isHindiDraft = hasDevanagariText(value);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !isLockedByOther,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
        },
        heading: { levels: [2, 3] },
      }),
      ArticleImage,
      ArticleResourceCard,
      TableKit.configure({ table: { resizable: true, allowTableNodeSelection: true } }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    content: value || '',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': 'Article body editor',
        'aria-multiline': 'true',
        class:
          'prose prose-sm max-w-none p-3 text-gray-900 focus:outline-none dark:prose-invert dark:text-gray-100 sm:p-4 [&_figure]:cursor-grab [&_aside]:cursor-grab [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6',
      },
      handlePaste: (_view, event) => {
        const plainText = event.clipboardData?.getData('text/plain') || '';
        const html = event.clipboardData?.getData('text/html') || '';
        const compact = plainText.trim();
        const youtubeId = compact && !/\s/u.test(compact) ? extractYouTubeVideoId(compact) : null;
        const currentEditor = editorRef.current;
        if (!currentEditor) return false;
        if (youtubeId) {
          event.preventDefault();
          currentEditor.commands.insertContent({
            type: 'paragraph',
            content: [{
              type: 'text',
              text: `[youtube:https://www.youtube.com/watch?v=${youtubeId}]`,
            }],
          });
          return true;
        }
        if (!html && plainText.includes('\n')) {
          const polished = buildPolishedPlainTextHtml(plainText);
          if (polished) {
            event.preventDefault();
            currentEditor.commands.insertContent(polished);
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const imageFile = Array.from(event.dataTransfer?.files || []).find((file) =>
          file.type.toLowerCase().startsWith('image/')
        );
        if (!imageFile) return false;
        event.preventDefault();
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        uploadDropRef.current(imageFile, position);
        return true;
      },
      handleKeyDown: (_view, event) => {
        const currentEditor = editorRef.current;
        if (!currentEditor) return false;
        const withMeta = event.ctrlKey || event.metaKey;
        if (withMeta && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          setToolError('');
          setToolFields({ url: currentEditor.getAttributes('link').href || '', text: '' });
          setActiveTool('link');
          return true;
        }
        if (withMeta && event.altKey && event.key === '2') {
          event.preventDefault();
          currentEditor.chain().focus().toggleHeading({ level: 2 }).run();
          return true;
        }
        if (withMeta && event.altKey && event.key === '3') {
          event.preventDefault();
          currentEditor.chain().focus().toggleHeading({ level: 3 }).run();
          return true;
        }
        if (event.key === '/') {
          const { $from } = currentEditor.state.selection;
          if ($from.parentOffset === 0) {
            setSlashMenuOpen(true);
          }
        }
        if (event.key === 'Escape') setSlashMenuOpen(false);
        return false;
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const html = cleanEditorHtml(updatedEditor.getHTML());
      onChange(html);
      onDocumentChange?.(updatedEditor.getJSON() as Record<string, unknown>);
      setEditorRevision((revision) => revision + 1);
    },
    onSelectionUpdate: () => setEditorRevision((revision) => revision + 1),
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!isLockedByOther);
    }
  }, [editor, isLockedByOther]);

  useEffect(() => {
    if (!editor) return;
    const current = cleanEditorHtml(editor.getHTML());
    if (current !== value) editor.commands.setContent(value || '', { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    const buttons = toolbarRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    buttons?.forEach((button, index) => {
      button.tabIndex = index === 0 ? 0 : -1;
    });
  }, [editor]);

  useEffect(() => {
    if (!activeTool) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => {
      const dialog = toolDialogRef.current;
      const firstField = dialog?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select');
      const closeButton = dialog?.querySelector<HTMLElement>('button[aria-label="Close editor tool"]');
      (firstField || closeButton)?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeTool]);

  const openTool = (tool: EditorTool, fields: Record<string, string> = {}) => {
    toolOpenerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setToolFields(fields);
    setToolError('');
    setActiveTool(tool);
    setSlashMenuOpen(false);
  };

  const closeTool = () => {
    const opener = toolOpenerRef.current;
    setActiveTool(null);
    setToolFields({});
    setToolError('');
    setPendingImagePosition(undefined);
    toolOpenerRef.current = null;
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
      else editor?.commands.focus();
    });
  };

  const handleToolDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeTool();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const updateToolField = (name: string, nextValue: string) => {
    setToolFields((current) => ({ ...current, [name]: nextValue }));
  };

  const deleteSlashToken = () => {
    if (!editor) return;
    const { from } = editor.state.selection;
    if (from > 0 && editor.state.doc.textBetween(from - 1, from) === '/') {
      editor.commands.deleteRange({ from: from - 1, to: from });
    }
  };

  const runSlashCommand = (command: 'h2' | 'h3' | 'quote' | 'bullet' | 'table' | 'image' | 'resource') => {
    if (!editor) return;
    deleteSlashToken();
    if (command === 'h2') editor.chain().focus().setHeading({ level: 2 }).run();
    if (command === 'h3') editor.chain().focus().setHeading({ level: 3 }).run();
    if (command === 'quote') editor.chain().focus().toggleBlockquote().run();
    if (command === 'bullet') editor.chain().focus().toggleBulletList().run();
    if (command === 'table') openTool('table', { columns: '3', rows: '3' });
    if (command === 'image') inlineImageInputRef.current?.click();
    if (command === 'resource')
      openTool('resource', { title: 'Source / Reference', url: '', description: '' });
    setSlashMenuOpen(false);
  };

  const handleToolbarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []
    );
    if (!buttons.length) return;
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : event.key === 'ArrowRight'
            ? (currentIndex + 1) % buttons.length
            : (currentIndex - 1 + buttons.length) % buttons.length;
    event.preventDefault();
    buttons.forEach((button, index) => {
      button.tabIndex = index === nextIndex ? 0 : -1;
    });
    buttons[nextIndex]?.focus();
  };

  const moveCurrentBlock = (direction: -1 | 1) => {
    if (!editor) return;
    const nodes: ProseMirrorNode[] = [];
    editor.state.doc.forEach((node) => nodes.push(node));
    const currentIndex = editor.state.selection.$from.index(0);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= nodes.length) return;
    const [currentNode] = nodes.splice(currentIndex, 1);
    nodes.splice(targetIndex, 0, currentNode);
    const transaction = editor.state.tr.replaceWith(
      0,
      editor.state.doc.content.size,
      Fragment.fromArray(nodes)
    );
    let position = 0;
    for (let index = 0; index < targetIndex; index += 1) position += nodes[index].nodeSize;
    transaction.setSelection(
      TextSelection.near(transaction.doc.resolve(Math.min(position + 1, transaction.doc.content.size)))
    );
    editor.view.dispatch(transaction);
    editor.commands.focus();
  };

  const uploadInlineImage = async (file: File, position?: number) => {
    if (!file.type.toLowerCase().startsWith('image/')) {
      setToolError('Choose a JPG, PNG, WebP, or AVIF image.');
      return;
    }
    setIsUploadingInlineImage(true);
    setToolError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('purpose', 'image');
      body.append('optimizeArticleImage', 'true');
      body.append('focalPointX', '50');
      body.append('focalPointY', '50');
      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { ...getAuthHeader() },
        body,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: { url?: string; secureUrl?: string };
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to upload inline image');
      }
      const src = String(payload.data?.secureUrl || payload.data?.url || '').trim();
      if (!src) throw new Error('Inline image upload returned no URL');
      setPendingImagePosition(position);
      openTool('image', {
        src,
        alt: file.name.replace(/\.[^.]+$/, ''),
        caption: '',
        credit: '',
        sourceUrl: '',
        focalX: '50',
        focalY: '50',
      });
    } catch (uploadError) {
      setToolError(uploadError instanceof Error ? uploadError.message : 'Failed to upload image');
    } finally {
      setIsUploadingInlineImage(false);
    }
  };

  uploadDropRef.current = (file, position) => {
    void uploadInlineImage(file, position);
  };

  const handleInlineImageInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void uploadInlineImage(file);
    event.target.value = '';
  };

  const submitTool = () => {
    if (!editor || !activeTool) return;

    if (activeTool === 'link') {
      const url = normalizeArticleEditorLinkUrl(toolFields.url || '');
      if (!url) return setToolError('Enter a valid link URL.');
      const { from, to } = editor.state.selection;
      if (from !== to) {
        editor.chain().focus().setLink({ href: url }).run();
      } else {
        const label = toolFields.text?.trim() || url;
        editor.chain().focus().insertContent({
          type: 'text',
          text: label,
          marks: [{ type: 'link', attrs: { href: url } }],
        }).run();
      }
    }
    if (activeTool === 'youtube') {
      const videoId = extractYouTubeVideoId(toolFields.url || '');
      if (!videoId) return setToolError('Enter a valid YouTube URL.');
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'paragraph',
          content: [{
            type: 'text',
            text: `[youtube:https://www.youtube.com/watch?v=${videoId}]`,
          }],
        })
        .run();
    }
    if (activeTool === 'social') {
      const url = normalizeArticleEditorLinkUrl(toolFields.url || '');
      if (!url) return setToolError('Enter a valid social post URL.');
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'paragraph',
          content: [{
            type: 'text',
            text: `[social:${toolFields.platform || 'link'}:${url}]`,
          }],
        })
        .run();
    }
    if (activeTool === 'resource') {
      if (!toolFields.title?.trim()) return setToolError('Enter a resource title.');
      editor.commands.insertContent({
        type: 'articleResourceCard',
        attrs: {
          title: toolFields.title.trim(),
          url: normalizeArticleEditorLinkUrl(toolFields.url || ''),
          description: toolFields.description?.trim() || '',
        },
      });
    }
    if (activeTool === 'table') {
      editor
        .chain()
        .focus()
        .insertTable({
          rows: Math.min(8, Math.max(2, Number(toolFields.rows || 3))),
          cols: Math.min(6, Math.max(2, Number(toolFields.columns || 3))),
          withHeaderRow: true,
        })
        .run();
    }
    if (activeTool === 'quote') {
      const quote = toolFields.quote?.trim() || '';
      if (!quote) return setToolError('Enter quote text.');
      const attribution = toolFields.attribution?.trim() || '';
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: quote }] },
            ...(attribution
              ? [{
                  type: 'paragraph',
                  content: [{ type: 'text', text: `— ${attribution}` }],
                }]
              : []),
          ],
        })
        .run();
    }
    if (activeTool === 'image') {
      if (!toolFields.src?.trim()) return setToolError('Upload an image first.');
      if (!toolFields.alt?.trim()) return setToolError('Add descriptive alt text.');
      if (!toolFields.credit?.trim()) return setToolError('Add an image credit or source.');
      const imageNode = {
        type: 'articleImage',
        attrs: {
          src: toolFields.src.trim(),
          alt: toolFields.alt.trim(),
          caption: toolFields.caption?.trim() || '',
          credit: toolFields.credit.trim(),
          sourceUrl: normalizeArticleEditorLinkUrl(toolFields.sourceUrl || ''),
          focalX: Number(toolFields.focalX || 50),
          focalY: Number(toolFields.focalY || 50),
        },
      };
      if (typeof pendingImagePosition === 'number') {
        editor.commands.insertContentAt(pendingImagePosition, imageNode);
      } else {
        editor.commands.insertContent(imageNode);
      }
    }
    closeTool();
  };

  const toolButtonClass = (active = false) =>
    cx(
      'inline-flex min-h-9 min-w-9 items-center justify-center rounded-md p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spanish-red focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40',
      active
        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950'
        : 'text-gray-700 hover:bg-gray-200 dark:text-gray-100 dark:hover:bg-white/10'
    );

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm focus-within:border-spanish-red dark:border-white/20 dark:bg-zinc-950">
      {/* Locked by another user notice banner */}
      {isLockedByOther && lockedBy ? (
        <div
          role="alert"
          className="border-b border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <span className="text-xl" aria-hidden="true">⚠️</span>
              <div>
                <p className="font-bold">
                  संपादन अवरुद्ध (Editing Locked)
                </p>
                <p className="mt-0.5 text-sm">
                  यह लेख वर्तमान में <strong>{lockedBy.userName}</strong> ({lockedBy.userRole}) द्वारा संपादित किया जा रहा है। डेटा टकराव से बचने के लिए संपादन अक्षम किया गया है।
                </p>
              </div>
            </div>

            {canTakeOver ? (
              <button
                type="button"
                onClick={() => setShowTakeOverModal(true)}
                disabled={isTakingOver}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
              >
                {isTakingOver ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                <span>Take Over Editing (संपादन नियंत्रण लें)</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Confirmation modal for Take-Over */}
      {showTakeOverModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl dark:bg-zinc-900">
            <h3 className="text-base font-bold text-zinc-950 dark:text-white">
              Confirm Take Over
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Are you sure you want to take over? {lockedBy?.userName}&apos;s unsaved changes may be lost.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTakeOverModal(false)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const success = await takeOver();
                  if (success) {
                    setShowTakeOverModal(false);
                    setTakeOverToast('Editing control acquired successfully.');
                    setTimeout(() => setTakeOverToast(''), 4000);
                  }
                }}
                disabled={isTakingOver}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {isTakingOver ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Confirm Take Over
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Success Toast */}
      {takeOverToast ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200">
          {takeOverToast}
        </div>
      ) : null}

      <input
        ref={inlineImageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={handleInlineImageInput}
        className="hidden"
      />
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Article formatting toolbar"
        aria-orientation="horizontal"
        onKeyDown={handleToolbarKeyDown}
        className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 p-2 dark:border-white/15 dark:bg-white/[0.04]"
      >
        <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} disabled={isLockedByOther} className={toolButtonClass(editor?.isActive('bold'))} aria-label="Bold" title="Bold (Ctrl+B)"><Bold className="h-4 w-4" /></button>
        <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} disabled={isLockedByOther} className={toolButtonClass(editor?.isActive('italic'))} aria-label="Italic" title="Italic (Ctrl+I)"><Italic className="h-4 w-4" /></button>
        <button type="button" onClick={() => editor?.chain().focus().toggleUnderline().run()} disabled={isLockedByOther} className={toolButtonClass(editor?.isActive('underline'))} aria-label="Underline" title="Underline (Ctrl+U)"><Underline className="h-4 w-4" /></button>
        <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} disabled={isLockedByOther} className={toolButtonClass(editor?.isActive('heading', { level: 2 }))} aria-label="Heading 2" title="Heading 2 (Ctrl+Alt+2)">H2</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} disabled={isLockedByOther} className={toolButtonClass(editor?.isActive('heading', { level: 3 }))} aria-label="Heading 3" title="Heading 3 (Ctrl+Alt+3)">H3</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} disabled={isLockedByOther} className={toolButtonClass(editor?.isActive('bulletList'))} aria-label="Bullet list"><List className="h-4 w-4" /></button>
        <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} disabled={isLockedByOther} className={toolButtonClass(editor?.isActive('orderedList'))} aria-label="Numbered list"><ListOrdered className="h-4 w-4" /></button>
        <button type="button" onClick={() => openTool('link', { url: editor?.getAttributes('link').href || '', text: '' })} disabled={isLockedByOther} className={toolButtonClass(editor?.isActive('link'))} aria-label="Insert link" title="Link (Ctrl+K)"><Link2 className="h-4 w-4" /></button>
        <button type="button" onClick={() => openTool('quote', { quote: '', attribution: '' })} disabled={isLockedByOther} className={toolButtonClass(editor?.isActive('blockquote'))} aria-label="Insert quote"><MessageSquareQuote className="h-4 w-4" /></button>
        <button type="button" onClick={() => openTool('table', { columns: '3', rows: '3' })} disabled={isLockedByOther} className={toolButtonClass(editor?.isActive('table'))} aria-label="Insert table"><Table2 className="h-4 w-4" /></button>
        <button type="button" onClick={() => inlineImageInputRef.current?.click()} disabled={isUploadingInlineImage || isLockedByOther} className={toolButtonClass()} aria-label="Upload inline image">{isUploadingInlineImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}</button>
        <button type="button" onClick={() => moveCurrentBlock(-1)} disabled={isLockedByOther} className={toolButtonClass()} aria-label="Move current block up"><ArrowUp className="h-4 w-4" /></button>
        <button type="button" onClick={() => moveCurrentBlock(1)} disabled={isLockedByOther} className={toolButtonClass()} aria-label="Move current block down"><ArrowDown className="h-4 w-4" /></button>
        <button type="button" onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()} disabled={isLockedByOther} className={toolButtonClass()} aria-label="Clear formatting">Clear</button>
        <button type="button" onClick={() => editor?.commands.setContent(polishArticleEditorHtml(editor.getHTML()))} disabled={isLockedByOther} className={toolButtonClass()} aria-label="Polish pasted formatting"><Wand2 className="h-4 w-4" /></button>
        <button type="button" onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo() || isLockedByOther} className={toolButtonClass()} aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
        <button type="button" onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo() || isLockedByOther} className={toolButtonClass()} aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
        <button type="button" onClick={() => openTool('youtube', { url: '' })} disabled={isLockedByOther} className={toolButtonClass()} aria-label="Insert YouTube embed">YouTube</button>
        <button type="button" onClick={() => openTool('resource', { title: 'Source / Reference', url: '', description: '' })} disabled={isLockedByOther} className={toolButtonClass()} aria-label="Insert resource card">Resource</button>

        {hasLock && articleId ? (
          <div className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>🔒 You have editing lock (Auto-renews)</span>
          </div>
        ) : null}
      </div>

      {slashMenuOpen ? (
        <div className="border-b border-gray-200 bg-white p-2 dark:border-white/15 dark:bg-zinc-950" role="menu" aria-label="Slash commands">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Insert block</p>
          <div className="flex flex-wrap gap-1">
            {([
              ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['quote', 'Quote'], ['bullet', 'Bullet list'], ['table', 'Table'], ['image', 'Image'], ['resource', 'Resource'],
            ] as const).map(([command, label]) => (
              <button key={command} type="button" role="menuitem" onClick={() => runSlashCommand(command)} className="min-h-9 rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-50 dark:border-white/15 dark:text-gray-100 dark:hover:bg-white/10">{label}</button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="relative bg-white dark:bg-zinc-950">
        <EditorContent
          editor={editor}
          className={`${editorClassName} [&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:break-words [&_.ProseMirror]:whitespace-pre-wrap [&_.is-editor-empty:first-child:before]:pointer-events-none [&_.is-editor-empty:first-child:before]:float-left [&_.is-editor-empty:first-child:before]:h-0 [&_.is-editor-empty:first-child:before]:text-gray-400 [&_.is-editor-empty:first-child:before]:content-[attr(data-placeholder)]`}
          style={{ fontFamily: isHindiDraft ? HINDI_EDITOR_FONT_STYLE : undefined }}
        />
      </div>

      <div className="flex flex-wrap gap-x-2 border-t border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-gray-400">
        <span>{editor?.storage.characterCount.characters() || 0} characters</span>
        <span>TipTap structured blocks · type / for commands · drag images/resources or move blocks with arrows</span>
        {toolError && !activeTool ? <span className="font-semibold text-red-600">{toolError}</span> : null}
      </div>

      {activeTool ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeTool();
          }}
        >
          <div ref={toolDialogRef} role="dialog" aria-modal="true" aria-labelledby="article-editor-tool-title" onKeyDown={handleToolDialogKeyDown} className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div><h3 id="article-editor-tool-title" className="font-bold text-gray-950 dark:text-white">Insert {activeTool}</h3><p className="mt-1 text-xs text-gray-500">Review every field before inserting this block.</p></div>
              <button type="button" onClick={closeTool} className="min-h-9 min-w-9 rounded-md p-2 hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Close editor tool"><X className="h-4 w-4" /></button>
            </div>
            {toolError ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{toolError}</p> : null}
            <div className="mt-4 space-y-3">
              {activeTool === 'link' ? <><input value={toolFields.url || ''} onChange={(event) => updateToolField('url', event.target.value)} placeholder="https://example.com" aria-label="Link URL" className="w-full rounded-md border px-3 py-2" /><input value={toolFields.text || ''} onChange={(event) => updateToolField('text', event.target.value)} placeholder="Link text when nothing is selected" aria-label="Link text" className="w-full rounded-md border px-3 py-2" /></> : null}
              {activeTool === 'youtube' || activeTool === 'social' ? <input value={toolFields.url || ''} onChange={(event) => updateToolField('url', event.target.value)} placeholder="Paste post URL" aria-label="Embed URL" className="w-full rounded-md border px-3 py-2" /> : null}
              {activeTool === 'resource' ? <><input value={toolFields.title || ''} onChange={(event) => updateToolField('title', event.target.value)} placeholder="Resource title" aria-label="Resource title" className="w-full rounded-md border px-3 py-2" /><input value={toolFields.url || ''} onChange={(event) => updateToolField('url', event.target.value)} placeholder="Resource URL" aria-label="Resource URL" className="w-full rounded-md border px-3 py-2" /><textarea value={toolFields.description || ''} onChange={(event) => updateToolField('description', event.target.value)} placeholder="Why this source matters" aria-label="Resource description" rows={3} className="w-full rounded-md border px-3 py-2" /></> : null}
              {activeTool === 'table' ? <div className="grid grid-cols-2 gap-3"><input type="number" min={2} max={6} value={toolFields.columns || '3'} onChange={(event) => updateToolField('columns', event.target.value)} aria-label="Table columns" className="w-full rounded-md border px-3 py-2" /><input type="number" min={2} max={8} value={toolFields.rows || '3'} onChange={(event) => updateToolField('rows', event.target.value)} aria-label="Table rows" className="w-full rounded-md border px-3 py-2" /></div> : null}
              {activeTool === 'quote' ? <><textarea value={toolFields.quote || ''} onChange={(event) => updateToolField('quote', event.target.value)} placeholder="Quote text" aria-label="Quote text" rows={4} className="w-full rounded-md border px-3 py-2" /><input value={toolFields.attribution || ''} onChange={(event) => updateToolField('attribution', event.target.value)} placeholder="Attribution" aria-label="Quote attribution" className="w-full rounded-md border px-3 py-2" /></> : null}
              {activeTool === 'image' ? <><input value={toolFields.alt || ''} onChange={(event) => updateToolField('alt', event.target.value)} placeholder="Descriptive alt text" aria-label="Image alt text" className="w-full rounded-md border px-3 py-2" /><textarea value={toolFields.caption || ''} onChange={(event) => updateToolField('caption', event.target.value)} placeholder="Caption" aria-label="Image caption" rows={2} className="w-full rounded-md border px-3 py-2" /><input value={toolFields.credit || ''} onChange={(event) => updateToolField('credit', event.target.value)} placeholder="Required credit or source" aria-label="Image credit" className="w-full rounded-md border px-3 py-2" /><input value={toolFields.sourceUrl || ''} onChange={(event) => updateToolField('sourceUrl', event.target.value)} placeholder="Optional source URL" aria-label="Image source URL" className="w-full rounded-md border px-3 py-2" /><div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold">Focal X<input type="range" min={0} max={100} value={toolFields.focalX || '50'} onChange={(event) => updateToolField('focalX', event.target.value)} className="w-full" /></label><label className="text-xs font-semibold">Focal Y<input type="range" min={0} max={100} value={toolFields.focalY || '50'} onChange={(event) => updateToolField('focalY', event.target.value)} className="w-full" /></label></div></> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={closeTool} className="min-h-9 rounded-md border px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" onClick={submitTool} className="min-h-9 rounded-md bg-spanish-red px-4 py-2 text-sm font-semibold text-white">Insert</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
