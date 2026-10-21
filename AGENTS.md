# Writing a template for this repository

A template is one folder under `templates/`, named by its id, holding a `template.yaml`, the
`workflow.yaml` a new workflow is created from, and its `preview.svg`. The README's layout and
rules are the contract; this file says how to meet them.

## The workflow

- Write it for the archmax harness's machine spec. It has to validate with no error and no
  warning; run it through the harness's validator before opening a pull request.
- Keep the twelve default tools under `tools.allow_always`, and grant a state the tools it
  needs in its own `tools.allow`. Name no connection on a tool or a trigger.
- Write each state's `instructions` for the agent that runs it: what to do, in what order, and
  what to write where. A state the session only reaches through a decision does not answer
  "the user's latest message"; it does its work and says what it did.
- Give every transition a description the agent can choose by.
- Place every state (`metadata.x`, `metadata.y`; columns 500 apart, rows 200), and give it a
  `metadata.color` from the appearance palette (`sage`, `rose`, `blue`, `purple`, `rust`,
  `amber`, `yellow`, `teal`) and a `metadata.icon`, a lucide icon name such as `MessagesSquare`.

## What the template cannot know

Leave it as a note, never as a guess in the instructions. A note in `metadata.notes` is
`{ id, text, x, y, width, height, color }`: a yellow one beginning "To do:" for each thing the
person has to fill in or connect, placed beside the states it is about, and a blue one for an
explanation. Name the state, the tool or the trigger the to-do is about by the title the
canvas shows.

## `template.yaml`

`name` and `description` are what a person reads when choosing a template, and they are not
developers: say what the workflow does for them, in their words. `order` places it in the
list, and `connections` names every collection whose tools it grants.

## Checklist before opening a pull request

- [ ] Folder is `templates/<id>/` with a lowercase-hyphen id and no symbolic links.
- [ ] `template.yaml` has `name`, `description`, `order` and `connections`.
- [ ] `workflow.yaml` validates with no error and no warning, and lists the default tools.
- [ ] No tool or trigger names a connection.
- [ ] Every state has its place, colour and icon; every to-do is a yellow note.
- [ ] `preview.svg` is drawn by `npm run previews`, not edited by hand.
