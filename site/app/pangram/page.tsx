import Link from "next/link";

export const metadata = { title: "Pangram for Word" };

export default function PangramForWordPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Pangram for Word</h1>
      <p className="leading-relaxed">
        A Microsoft Word add-in that scores the open document with{" "}
        <a href="https://www.pangram.com" className="underline">Pangram</a> AI
        detection: one number, a gauge, and a link to the full analysis. Third
        party extension, no affiliation to Pangram. You bring your own Pangram
        API key; it is sent straight to Pangram and never stored here.
      </p>
      <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
        <li>
          Download the{" "}
          <a href="/pangram/manifest.xml" download className="underline">
            add-in manifest
          </a>
          .
        </li>
        <li>
          Mac: put it in{" "}
          <code className="text-sm">~/Library/Containers/com.microsoft.Word/Data/Documents/wef/</code>{" "}
          (create the folder if needed). Windows: follow Microsoft&apos;s{" "}
          <a
            href="https://learn.microsoft.com/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins"
            className="underline"
          >
            shared-folder sideload steps
          </a>
          .
        </li>
        <li>Restart Word, click <strong>Pangram</strong> on the Home tab, paste your API key, and hit Analyze.</li>
      </ol>
      <p className="leading-relaxed text-sm text-gray-500">
        Source and local-dev instructions:{" "}
        <a href="https://github.com/GaneshPimpale/pangram-for-word" className="underline">
          github.com/GaneshPimpale/pangram-for-word
        </a>
      </p>
      <Link href="/" className="text-sm text-gray-400 hover:text-gray-900 transition-colors">
        home
      </Link>
    </div>
  );
}
