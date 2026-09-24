'''Mobile whiteboard with marker diagrams, sticky notes, and a marker tray.'''
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
join(kit.mobile_whiteboard('w_'), 'whiteboard')
export()
