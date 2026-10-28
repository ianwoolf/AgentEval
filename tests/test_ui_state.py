import pytest
from streamlit.testing.v1 import AppTest


def _text_values(app: AppTest) -> set[str]:
    return {str(element.value) for element in app.text}


def test_route_state_clears_page_selections_and_resets_only_session_state():
    """A route-state regression must not retain page-local or durable state."""
    script = '''\
import streamlit as st
from src.ui.state import init_ui_state, navigate, reset_demo_state, select_agent

st.session_state.persisted_sentinel = "keep"
init_ui_state("demo-agent")
st.session_state.selected_dataset_id = "dataset-1"
st.session_state.selected_dataset_revision_id = "revision-1"
st.session_state.selected_run_id = "run-1"
st.session_state.selected_report_id = "report-1"
select_agent("second-agent")
st.text(f"selected_after_select={st.session_state.selected_agent_id}")
st.text(f"page_after_select={st.session_state.active_page}")
st.text(f"selection_keys_after_select={any(key in st.session_state for key in (\"selected_dataset_id\", \"selected_dataset_revision_id\", \"selected_run_id\", \"selected_report_id\"))}")
navigate("Dataset")
st.text(f"page_after_navigation={st.session_state.active_page}")
reset_demo_state("demo-agent")
st.text(f"selected_after_reset={st.session_state.selected_agent_id}")
st.text(f"page_after_reset={st.session_state.active_page}")
st.text(f"persisted_sentinel={st.session_state.persisted_sentinel}")
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert _text_values(app) == {
        "selected_after_select=second-agent",
        "page_after_select=Agent",
        "selection_keys_after_select=False",
        "page_after_navigation=Dataset",
        "selected_after_reset=demo-agent",
        "page_after_reset=Agent",
        "persisted_sentinel=keep",
    }


def test_navigate_rejects_unknown_pages():
    """A typo in a global route must fail rather than create invalid UI state."""
    script = '''\
import pytest
from src.ui.state import init_ui_state, navigate

init_ui_state()
with pytest.raises(ValueError):
    navigate("Unknown")
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception


@pytest.mark.parametrize("legacy_page", ("Agents", "Reports"))
def test_init_ui_state_normalizes_stale_global_route_values(legacy_page):
    """Old browser sessions must never reach a global route removed by migration."""
    script = f'''\
import streamlit as st
from src.ui.state import init_ui_state

st.session_state.active_page = {legacy_page!r}
init_ui_state("demo-agent")
st.text(st.session_state.active_page)
'''

    app = AppTest.from_string(script).run(timeout=20)

    assert not app.exception
    assert _text_values(app) == {"Agent"}
