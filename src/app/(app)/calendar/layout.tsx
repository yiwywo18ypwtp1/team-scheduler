// `modal` is a parallel route slot: it renders the intercepted event form on
// top of the calendar during in-app navigation, and nothing otherwise.
export default function CalendarLayout({ children, modal }: LayoutProps<"/calendar">) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
