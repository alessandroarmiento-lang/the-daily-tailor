#!/usr/bin/osascript
-- Incomplete flagged Reminders only (contrassegnati). JSON for The Daily Tailor.
on run argv
	tell application "Reminders"
		set rows to {}
		set hits to reminders whose flagged is true and completed is false
		repeat with r in hits
			try
				set t to name of r as text
				set notesText to ""
				try
					set notesText to body of r as text
				end try
				set listName to "Promemoria"
				try
					set listName to name of container of r as text
				end try
				set dueIso to ""
				try
					set d to due date of r
					if d is not missing value then set dueIso to my isoFromDate(d)
				end try
				set prio to "none"
				try
					set pr to priority of r
					if pr is 1 then
						set prio to "high"
					else if pr is 5 then
						set prio to "medium"
					else if pr is 9 then
						set prio to "low"
					end if
				end try
				set rid to ""
				try
					set rid to id of r as text
				end try
				set end of rows to "{\"id\":\"" & my escapeJson(rid) & "\",\"title\":\"" & my escapeJson(t) & "\",\"notes\":\"" & my escapeJson(my leftStr(notesText, 200)) & "\",\"listName\":\"" & my escapeJson(listName) & "\",\"dueAt\":" & my nullOrString(dueIso) & ",\"priority\":\"" & prio & "\",\"flagged\":true}"
			end try
		end repeat
	end tell

	set AppleScript's text item delimiters to ","
	set body to rows as text
	set AppleScript's text item delimiters to ""
	return "{\"ok\":true,\"items\":[" & body & "]}"
end run

on nullOrString(s)
	if s is "" then return "null"
	return "\"" & my escapeJson(s) & "\""
end nullOrString

on isoFromDate(d)
	set y to year of d as integer
	set mo to (month of d) as integer
	set da to day of d as integer
	set h to hours of d as integer
	set mi to minutes of d as integer
	return (y as text) & "-" & my pad2(mo) & "-" & my pad2(da) & "T" & my pad2(h) & ":" & my pad2(mi) & ":00"
end isoFromDate

on pad2(n)
	set s to n as text
	if length of s < 2 then return "0" & s
	return s
end pad2

on leftStr(t, n)
	set t to t as text
	if length of t ≤ n then return t
	return text 1 thru n of t
end leftStr

on escapeJson(t)
	set t to t as text
	set t to my replaceText(t, "\\", "\\\\")
	set t to my replaceText(t, "\"", "\\\"")
	set t to my replaceText(t, return, "\\n")
	set t to my replaceText(t, linefeed, "\\n")
	set t to my replaceText(t, tab, " ")
	return t
end escapeJson

on replaceText(t, findText, replaceWith)
	set AppleScript's text item delimiters to findText
	set parts to text items of t
	set AppleScript's text item delimiters to replaceWith
	set out to parts as text
	set AppleScript's text item delimiters to ""
	return out
end replaceText
