import { Mention, MentionOptions } from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import tippy, { Instance, Props } from "tippy.js";
import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { PluginKey } from "@tiptap/pm/state";
import { Briefcase, Heart, CheckSquare, Users, Hash } from "lucide-react";

const DEFAULT_TAGS = ["Work", "Life", "To-do", "Meetings"];

// The React component that renders the dropdown list
const HashtagList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command({ id: item });
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }
      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }
      if (event.key === "Enter") {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  if (!props.items || props.items.length === 0) {
    return null;
  }

  // Get icon and color for the tag
  const getTagMeta = (tag: string) => {
    switch (tag.toLowerCase()) {
      case "work": return { icon: Briefcase, color: "59, 130, 246" }; // Blue
      case "life": return { icon: Heart, color: "244, 63, 94" }; // Rose
      case "to-do": return { icon: CheckSquare, color: "16, 185, 129" }; // Emerald
      case "meetings": return { icon: Users, color: "245, 158, 11" }; // Amber
      default: return { icon: Hash, color: "168, 85, 247" }; // Purple
    }
  };

  return (
    <div className="novel-slash-menu z-50 w-48 shadow-xl !p-1 bg-white dark:bg-[#1A1A1A]">
      {props.items.map((item: string, index: number) => {
        const { icon: Icon, color } = getTagMeta(item);
        return (
          <button
            key={index}
            className={`novel-slash-item w-full text-left transition-colors ${
              index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
            }`}
            onClick={() => selectItem(index)}
            onMouseDown={(e) => {
              e.preventDefault();
              selectItem(index);
            }}
          >
            <div className="novel-slash-icon" style={{
              background: `linear-gradient(135deg, rgba(${color}, var(--icon-bg-start)) 0%, rgba(${color}, var(--icon-bg-end)) 100%)`,
              border: `1px solid rgba(${color}, var(--icon-border))`,
              color: `rgba(${color}, 1)`,
            }}>
              <Icon size={16} strokeWidth={2.5} />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[13px] font-medium truncate">{item}</p>
              <p className="text-[10px] text-muted-foreground truncate">Add tag to note</p>
            </div>
          </button>
        );
      })}
    </div>
  );
});

HashtagList.displayName = "HashtagList";

// The Tiptap extension configuration
export const HashtagExtension = Mention.extend({
  name: "hashtag",
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: "inline-flex items-center rounded-md border border-border/50 bg-accent/30 px-1.5 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
      },
      renderText({ options, node }) {
        return `#${node.attrs.id ?? node.attrs.label}`;
      },
      renderHTML({ options, node }) {
        return [
          "span",
          options.HTMLAttributes,
          `#${node.attrs.id ?? node.attrs.label}`,
        ];
      },
      suggestion: {
        char: "#",
        pluginKey: new PluginKey("hashtag"),
        items: ({ query }: { query: string }) => {
          return DEFAULT_TAGS.filter((item) =>
            item.toLowerCase().includes(query.toLowerCase())
          ).slice(0, 4);
        },
        render: () => {
          let component: ReactRenderer;
          let popup: Instance[];

          return {
            onStart: (props: any) => {
              component = new ReactRenderer(HashtagList, {
                props,
                editor: props.editor,
              });

              if (!props.clientRect) {
                return;
              }

              popup = tippy("body", {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              });
            },

            onUpdate(props: any) {
              component.updateProps(props);

              if (!props.clientRect) {
                return;
              }

              popup[0].setProps({
                getReferenceClientRect: props.clientRect,
              });
            },

            onKeyDown(props: any) {
              if (props.event.key === "Escape") {
                popup[0].hide();
                return true;
              }
              return component.ref?.onKeyDown(props);
            },

            onExit() {
              popup[0].destroy();
              component.destroy();
            },
          };
        },
      },
    };
  },
});
