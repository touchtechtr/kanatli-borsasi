import SidebarContent from "./SidebarContent";

export default function Sidebar() {
  return (
    <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-navy-800 bg-navy-950 md:flex">
      <SidebarContent />
    </aside>
  );
}