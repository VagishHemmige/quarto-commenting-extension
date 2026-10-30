-- source-snippet: fill an empty code block with lines taken from a real file
-- in this repository, so the site always shows the code as it is, never a
-- pasted copy.
--
--   ```{.js file="_extensions/issue-comments/issue-comments.js"
--          from="function issueTitle(" to="}"}
--   ```
--
-- file  path from the project root (required)
-- from  text that appears on exactly one line of the file; the snippet starts
--       there. If it is the whole of one line (leading and trailing spaces
--       ignored), that line is used even if the text also appears elsewhere.
--       Omit it to show the whole file.
-- to    the snippet ends at the first later line that is exactly this text and
--       is indented like the `from` line, which is where a block's closing
--       `}` or `end` sits. Write it without the indentation. Omit it to stop
--       at the line before the next blank line.
--
-- The render fails if the file is missing, `from` matches no line or more
-- than one, or `to` is never reached. A rename or rewrite in the source
-- therefore breaks the build instead of leaving a stale page.
--
-- Each snippet gets a caption naming the file and line range, linked to those
-- lines on GitHub, using `source-snippet: repo-url / repo-branch` in
-- _quarto.yml (a filter cannot read the `website:` settings).
-- Common leading indentation is removed.

local repo_url, repo_branch

local function stringify(v)
  if v == nil then return nil end
  local s = pandoc.utils.stringify(v)
  if s == "" then return nil end
  return s
end

-- Quarto logs an error() raised in a filter and carries on, so stop the
-- render outright: a page with a missing snippet must not be published.
local function fail(msg)
  local text = "source-snippet: " .. msg
  if quarto and quarto.log then quarto.log.error(text) else io.stderr:write(text .. "\n") end
  os.exit(1)
end

local function read_lines(rel)
  local root = (quarto and quarto.project and quarto.project.directory) or "."
  local path = pandoc.path.join({ root, rel })
  local fh = io.open(path, "r")
  if not fh then fail("cannot open " .. rel) end
  local text = fh:read("a")
  fh:close()
  local lines = {}
  for line in (text:gsub("\r\n?", "\n") .. "\n"):gmatch("(.-)\n") do
    lines[#lines + 1] = line
  end
  if lines[#lines] == "" then lines[#lines] = nil end
  return lines
end

local function find_range(lines, rel, from, to)
  if from == nil then return 1, #lines end
  local function trim(x) return (x:gsub("^%s+", ""):gsub("%s+$", "")) end
  local exact, partial = {}, {}
  for i, line in ipairs(lines) do
    if trim(line) == trim(from) then exact[#exact + 1] = i end
    if line:find(from, 1, true) then partial[#partial + 1] = i end
  end
  local hits = #exact == 1 and exact or partial
  if #hits > 1 then
    fail(rel .. ': from="' .. from .. '" matches lines ' .. table.concat(hits, ", ") ..
      "; make it more specific, or give the whole line")
  end
  local start = hits[1]
  if not start then fail(rel .. ': from="' .. from .. '" matches no line') end

  if to == nil then
    local last = start
    while lines[last + 1] and lines[last + 1]:match("%S") do last = last + 1 end
    return start, last
  end
  local indent = lines[start]:match("^%s*")
  for i = start + 1, #lines do
    if lines[i]:match("^%s*") == indent and trim(lines[i]) == trim(to) then
      return start, i
    end
  end
  fail(rel .. ': to="' .. to .. '" never reached, at the indentation of line ' .. start)
end

local function dedent(lines)
  local min
  for _, line in ipairs(lines) do
    if line:match("%S") then
      local n = #line:match("^ *")
      if not min or n < min then min = n end
    end
  end
  if not min or min == 0 then return lines end
  local out = {}
  for i, line in ipairs(lines) do out[i] = line:sub(min + 1) end
  return out
end

local function Meta(meta)
  local cfg = meta["source-snippet"]
  if type(cfg) == "table" then
    repo_url = stringify(cfg["repo-url"])
    repo_branch = stringify(cfg["repo-branch"]) or "main"
  end
end

local function CodeBlock(block)
  local rel = block.attributes["file"]
  if rel == nil then return nil end
  if block.text:match("%S") then
    fail(rel .. ": the code block must be empty; its content comes from the file")
  end

  local lines = read_lines(rel)
  local a, b = find_range(lines, rel, block.attributes["from"], block.attributes["to"])
  local picked = {}
  for i = a, b do picked[#picked + 1] = lines[i] end

  block.text = table.concat(dedent(picked), "\n")
  block.attributes["file"] = nil
  block.attributes["from"] = nil
  block.attributes["to"] = nil

  local where = a == 1 and b == #lines and (rel .. " (whole file)")
    or a == b and string.format("%s, line %d", rel, a)
    or string.format("%s, lines %d–%d", rel, a, b)
  local caption
  if repo_url then
    local href = string.format("%s/blob/%s/%s#L%d-L%d", (repo_url:gsub("/$", "")),
      repo_branch, rel, a, b)
    caption = pandoc.Para({ pandoc.Link(pandoc.Code(where), href) })
  else
    caption = pandoc.Para({ pandoc.Code(where) })
  end
  return pandoc.Div({ caption, block }, pandoc.Attr("", { "source-snippet" }))
end

return {
  { Meta = Meta },
  { CodeBlock = CodeBlock },
}
