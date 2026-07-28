on run argv
    if (count of argv) is not 2 then error "Usage: export_word_pdf.applescript input.docx output.pdf"
    set inputPath to item 1 of argv
    set outputPath to item 2 of argv
    set inputAlias to POSIX file inputPath
    set outputHFSPath to (POSIX file outputPath) as text

    tell application "Microsoft Word"
        set oldAlerts to display alerts
        set display alerts to alerts none
        if exists document "BAB_3_9_Desain_UI_UX_CitraFrame.docx" then
            set docRef to document "BAB_3_9_Desain_UI_UX_CitraFrame.docx"
        else
            open inputAlias
            delay 2
            set docRef to active document
        end if
        delay 2
        save active document in (POSIX file outputPath) as format PDF
        delay 2
        set savedPath to full name of docRef
        close docRef saving no
        set display alerts to oldAlerts
        return savedPath
    end tell
end run
