#!/usr/bin/osascript
-- Fetch recent inbox messages from Apple Mail as JSON (rolling lookback).
-- Unified inbox covers iCloud + Gmail (and any other accounts in Mail.app).
-- Args: maxItems (default 80), lookbackDays (default 45)
on run argv
	set maxItems to 80
	set lookbackDays to 45
	if (count of argv) ≥ 1 then
		try
			set maxItems to (item 1 of argv) as integer
		end try
	end if
	if (count of argv) ≥ 2 then
		try
			set lookbackDays to (item 2 of argv) as integer
		end try
	end if
	if lookbackDays < 1 then set lookbackDays to 45

	set now to current date
	set endDay to current date
	set startDay to endDay - lookbackDays * days

	set accountNames to {}
	tell application "Mail"
		try
			set accountNames to name of every account
		end try

		set rows to {}
		try
			set msgs to (messages of inbox whose date received ≥ startDay)
		on error errMsg number errNum
			return "{\"ok\":false,\"error\":\"Mail whose failed (" & errNum & "): " & my escapeJson(errMsg) & "\",\"accounts\":" & my accountsJson(accountNames) & "}"
		end try

		set total to count of msgs
		-- Prefer newest: walk from the end of the mailbox list when possible.
		set collected to 0
		set i to total
		repeat while i ≥ 1 and collected < maxItems
			try
				set m to item i of msgs
				set subj to subject of m as text
				set snd to sender of m as text
				set d to date received of m
				set iso to my isoFromDate(d)
				set flagged to false
				try
					set flagged to flagged status of m
				end try
				set unread to false
				try
					set unread to not (read status of m)
				end try
				set preview to ""
				try
					set rawContent to content of m as text
					set preview to my firstLines(rawContent, 420)
				end try
				set msgId to ""
				try
					set msgId to message id of m as text
				end try
				set acct to ""
				try
					set acct to name of account of mailbox of m as text
				end try
				set end of rows to my objectJson(msgId, subj, snd, iso, flagged, unread, preview, acct)
				set collected to collected + 1
			end try
			set i to i - 1
		end repeat
	end tell

	set AppleScript's text item delimiters to ","
	set body to rows as text
	set AppleScript's text item delimiters to ""
	return "{\"ok\":true,\"window\":\"lookback\",\"lookbackDays\":" & lookbackDays & ",\"total\":" & total & ",\"accounts\":" & my accountsJson(accountNames) & ",\"items\":[" & body & "]}"
end run

on accountsJson(accountNames)
	set parts to {}
	repeat with a in accountNames
		set end of parts to "\"" & my escapeJson(a as text) & "\""
	end repeat
	set AppleScript's text item delimiters to ","
	set joined to parts as text
	set AppleScript's text item delimiters to ""
	return "[" & joined & "]"
end accountsJson

on isoFromDate(d)
	set y to year of d as integer
	set mo to (month of d) as integer
	set da to day of d as integer
	set h to hours of d as integer
	set mi to minutes of d as integer
	set se to seconds of d as integer
	return (y as text) & "-" & my pad2(mo) & "-" & my pad2(da) & "T" & my pad2(h) & ":" & my pad2(mi) & ":" & my pad2(se)
end isoFromDate

on pad2(n)
	set s to n as text
	if length of s < 2 then set s to "0" & s
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

on firstLines(t, maxLen)
	set cleaned to t as text
	set cleaned to my replaceText(cleaned, return, " ")
	set cleaned to my replaceText(cleaned, linefeed, " ")
	set cleaned to my replaceText(cleaned, tab, " ")
	repeat while cleaned contains "  "
		set cleaned to my replaceText(cleaned, "  ", " ")
	end repeat
	set cleaned to cleaned as text
	if (length of cleaned) > maxLen then
		return text 1 thru maxLen of cleaned
	end if
	return cleaned
end firstLines

on objectJson(msgId, subj, snd, iso, flagged, unread, preview, acct)
	set f to "false"
	if flagged then set f to "true"
	set u to "false"
	if unread then set u to "true"
	return "{\"id\":\"" & my escapeJson(msgId) & "\",\"subject\":\"" & my escapeJson(subj) & "\",\"sender\":\"" & my escapeJson(snd) & "\",\"receivedAt\":\"" & my escapeJson(iso) & "\",\"flagged\":" & f & ",\"unread\":" & u & ",\"preview\":\"" & my escapeJson(preview) & "\",\"account\":\"" & my escapeJson(acct) & "\"}"
end objectJson
