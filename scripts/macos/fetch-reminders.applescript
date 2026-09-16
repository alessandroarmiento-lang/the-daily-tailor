#!/usr/bin/osascript
-- Open incomplete Reminders due today (or undated), JSON out.
on run argv
	set maxItems to 20
	if (count of argv) ≥ 1 then
		try
			set maxItems to (item 1 of argv) as integer
		end try
	end if

	set todayStart to date (short date string of (current date))
	set tomorrowStart to todayStart + 1 * days

	tell application "Reminders"
		set rows to {}
		set collected to 0
		repeat with L in lists
			if collected ≥ maxItems then exit repeat
			try
				set remList to reminders of L whose completed is false
			on error
				set remList to {}
			end try
			repeat with r in remList
				if collected ≥ maxItems then exit repeat
				try
					set dueOk to false
					set dueIso to ""
					try
						set d to due date of r
						if d is not missing value then
							if d ≥ todayStart and d < tomorrowStart then
								set dueOk to true
								set dueIso to my isoFromDate(d)
							end if
						else
							set dueOk to true
						end if
					on error
						set dueOk to true
					end try
					if dueOk then
						set t to name of r as text
						set notesText to ""
						try
							set notesText to body of r as text
						end try
						set listName to name of L as text
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
						set end of rows to "{\"id\":\"" & my escapeJson(rid) & "\",\"title\":\"" & my escapeJson(t) & "\",\"notes\":\"" & my escapeJson(my leftStr(notesText, 200)) & "\",\"listName\":\"" & my escapeJson(listName) & "\",\"dueAt\":" & my nullOrString(dueIso) & ",\"priority\":\"" & prio & "\"}"
						set collected to collected + 1
					end if
				end try
			end repeat
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
