import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const agentDecorationKey = new PluginKey('agentDecoration');

export const AgentDecorationExtension = Extension.create({
  name: 'agentDecoration',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: agentDecorationKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, set) {
            // Map decorations through document changes to keep them at the right positions
            set = set.map(tr.mapping, tr.doc);

            const action = tr.getMeta(agentDecorationKey);
            if (action) {
              if (action.add) {
                const decos = action.add.map((range: { from: number; to: number; type?: 'add' | 'delete' }) => {
                  const node = tr.doc.nodeAt(range.from);
                  const isBlock = node && node.isBlock;
                  const className = range.type === 'delete' ? 'agent-delete-fake' : 'agent-highlight-fake';
                  
                  if (isBlock) {
                    const from = range.from + 1;
                    const to = range.to - 1;
                    if (to > from) {
                      return Decoration.inline(from, to, { class: className });
                    }
                    return Decoration.node(range.from, range.to, { class: className });
                  } else {
                    return Decoration.inline(range.from, range.to, { class: className });
                  }
                });
                return set.add(tr.doc, decos);
              }
              if (action.clear) {
                return DecorationSet.empty;
              }
            }
            return set;
          },
        },
        props: {
          decorations(state) {
            return agentDecorationKey.getState(state);
          },
        },
      }),
    ];
  },
});
