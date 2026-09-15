#!/usr/bin/osascript
-- Upcoming Calendar events for the next N days, JSON out.
on run argv
	set horizonDays to 4
	if (count of argv) ≥ 1 then
		try
			set horizonDays to (item 1 of argv) as integer
		end try
	end if

	set startDay to date (short date string of (current date))
	set endDay to startDay + horizonDays * days

	tell application "Calendar"
		set rows to {}
		set collected to 0
		set maxItems to horizonDays * 8
		repeat with C in calendars
			if collected ≥ maxItems then exit repeat
			try
				set evs to (events of C whose start date ≥ startDay and start date < endDay)
			on error
				set evs to {}
			end try
			repeat with e in evs
				if collected ≥ maxItems then exit repeat
				try
					set t to summary of e as text
					set loc to ""
					try
						set loc to location of e as text
					end try
					set s to start date of e
					set en to end date of e
					set allDay to false
					try
						set allDay to allday event of e
					end try
					set calName to name of C as text
					set eid to ""
					try
						set eid to uid of e as text
					end try
					set end of rows to "{\"id\":\"" & my escapeJson(eid) & "\",\"title\":\"" & my escapeJson(t) & "\",\"location\":" & my nullOrString(loc) & ",\"startsAt\":\"" & my isoFromDate(s) & "\",\"endsAt\":\"" & my isoFromDate(en) & "\",\"isAllDay\":" & my boolJson(allDay) & ",\"calendarName\":\"" & my escapeJson(calName) & "\"}"
					set collected to collected + 1
				end try
			end repeat
		end repeat
	end tell

	set AppleScript's text item delimiters to ","
	set body to rows as text
	set AppleScript's text item delimiters to ""
	return "{\"ok\":true,\"items\":[" & body & "]}"
end run

on boolJson(b)
	if b then return "true"
	return "false"
end boolJson

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
