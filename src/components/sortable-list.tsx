import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import type { Ulid } from "@/lib/dsl/types";
import { cn } from "@/lib/utils";

type SortableListProps<T extends { id: Ulid }> = {
  items: T[];
  onReorder: (order: Ulid[]) => void;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  className?: string;
};

export function SortableList<T extends { id: Ulid }>({
  items,
  onReorder,
  renderItem,
  className,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(active.id as Ulid);
    const to = ids.indexOf(over.id as Ulid);
    if (from < 0 || to < 0) return;
    const next = ids.slice();
    next.splice(to, 0, next.splice(from, 1)[0] as Ulid);
    onReorder(next);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className={cn("divide-y rounded-md border", className)}>
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id}>
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

type SortableRowProps = {
  id: Ulid;
  children: (handle: ReactNode) => ReactNode;
};

function SortableRow({ id, children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="ドラッグして並び替え"
      className="flex size-7 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-accent active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  );
  return (
    <li ref={setNodeRef} style={style}>
      {children(handle)}
    </li>
  );
}
